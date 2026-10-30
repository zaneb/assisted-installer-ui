# OVE below-the-sea: the disconnected UI on the local graphical console

## Context

`apps/assisted-disconnected-ui` is the air-gapped half of the OVE agent-based installer
flow. It runs on the rendezvous node as a Go server that serves the React SPA and
reverse-proxies `/api` to the local assisted-service. The only way to reach it is to point
a browser at `http(s)://<rendezvous-ip>:<port>/` **from a second machine on the same
network**.

That is a gap for an operator standing in front of the server. The machine has a monitor
attached and nothing is drawn on it. We want the UI rendered on that monitor, the way
Anaconda shows its web UI locally, so the install can be driven from the box itself.

The deliverable in this repo is a second entrypoint in the container image. The podman
invocation and systemd unit that select it live in `openshift/installer`, so they are
shipped here as documented, commented examples rather than as working code.

## Decisions

| Decision | Choice |
|---|---|
| Browser | `firefox` from RHEL AppStream |
| Compositor | `gnome-kiosk` from RHEL AppStream, as a Wayland display server on DRM/KMS |
| Packaging | Same image, new entrypoint. RPMs in the final stage of `Containerfile.ocp` |
| Launch | `podman run` from a host systemd unit that owns the logind session |
| VT | 7 |
| Base | RHEL 9 now, RHEL 10 when the image moves; one image, not two |

### Why not a framebuffer browser

The original brief was to avoid X11 and Wayland and render directly to the framebuffer.
That is not achievable with packaged components. Verified against CentOS Stream 9/10
repository metadata — the ART build root carries RHEL content only, no EPEL, no network:

| Package | RHEL 9 | EPEL 9 | RHEL 10 |
|---|---|---|---|
| `cog` / `wpewebkit` — WPE's DRM/KMS backend, **no compositor** | ✗ | ✗ | ✗ |
| `cage`, `weston` — minimal Wayland kiosk compositors | ✗ | `weston` only | ✗ |
| `chromium`, `qt5`/`qt6-qtwebengine` | ✗ | ✓ | ✗ |
| `gnome-kiosk` | ✓ 40.0 | — | ✓ 49.0 |
| `firefox` | ✓ 140 ESR | — | ✓ |

**No RPM-packaged browser draws to the framebuffer or to DRM/KMS directly.** WPE WebKit
plus `cog` is the right architecture for it, but it is packaged for no RHEL version, and
adopting it would mean vendoring a browser engine — and owning its CVE response — inside a
release-payload image. The lorax/`cockpit-client` route needs GTK on X11 or Wayland.

`gnome-kiosk` is not a GNOME desktop: it is mutter in kiosk mode, 13 MB, with no panel,
dash, session manager or settings daemon. It is the same choice Anaconda made, for the
same reason.

### Why RHEL 9 is fine, and why that matters

An earlier draft of this plan treated RHEL 9 as a serious risk, on the grounds that
Anaconda's `rhel-9` branch runs `Xorg … vt6` and uses gnome-kiosk only as an X11 window
manager, reserving the Wayland invocation for `main`. **That was a misreading.** Anaconda's
RHEL 9 installer UI is the old GTK3 application, which is an X11 client; it needs an X
server regardless of what gnome-kiosk can do.

RHEL 9 does support this configuration, and ships it:

- `gnome-kiosk` installs `/usr/lib/systemd/user/org.gnome.Kiosk@wayland.service`, and its
  README describes "a very minimal wayland display server and compositor".
- `gnome-kiosk-search-appliance` is a shipped Wayland session whose entire content is
  `gnome-kiosk` plus
  `ExecStart=/usr/bin/firefox --kiosk --private-window --new-instance <url>`.

That is this feature, already packaged in RHEL 9.

This matters beyond mere convenience. RHEL 10 raises the x86-64 baseline to v3, so RHEL 10
binaries do not run on older servers. A RHEL-10-only console would silently exclude
exactly the hardware someone is most likely to be standing in front of, and avoiding it
would mean a second container image — which is disproportionately painful to add.

One difference remains between Red Hat's path and ours, and it is handled in the
entrypoint: they go GDM → `gnome-session` → `gnome-kiosk` with *no flags*, selecting the
backend from `XDG_SESSION_TYPE=wayland` (`ConditionEnvironment=`). We launch the
compositor directly, so we set `XDG_SESSION_TYPE` *and* pass `--wayland --display-server`.
On mutter 40 the latter is what distinguishes taking over the DRM device from running
nested; on mutter 49 it is redundant but harmless.

### The logind constraint

Mutter can only become DRM master by asking `systemd-logind` for the device
(`TakeControl`/`TakeDevice`). There is no libseat or run-as-root fallback: mutter 49's
`meson.build` resolves seat access through `libsystemd` or `libelogind` only —
`error('No logind provider dependency found: tried libsystemd and libelogind')` — and
RHEL 9's `mutter` RPM requires `libsystemd.so.0`.

So something must create a real logind session with a seat and a VT before the compositor
starts. We let the host systemd unit do it with `PAMName=`, which is what Anaconda's
`run-in-new-session` helper does by hand. systemd's `setup_pam()` `pam_putenv()`s every
`Environment=` entry and merges `pam_getenvlist()` back into the unit environment, so
`$XDG_SESSION_ID` is available to `ExecStart=` and can be forwarded with
`-e XDG_SESSION_ID`.

Mutter then resolves the session by one of three paths, and any one suffices:

| Path | mutter 40 | mutter 49 |
|---|---|---|
| `$XDG_SESSION_ID` | — | first choice |
| `login1.GetSessionByPID` / `sd_pid_get_session` | first (cgroup-based) | second |
| `sd_uid_get_display(0)` via `/run/systemd/users/0` | fallback | last resort |

The third needs no namespace sharing at all, which is why `-v /run/systemd:ro` is
mandatory rather than optional. An earlier draft proposed `--cgroups=disabled
--cgroupns=host` to make the cgroup-based path resolve; that was the wrong lever (the
processes land in the unit's own cgroup, not a `session-N.scope`) and is not used.

`-v /run/udev:ro` is equally mandatory: gudev and libinput enumerate the DRM device *and*
the keyboard and mouse from the udev database.

**This is the one part of the design that is reasoned from source rather than observed**,
and it is the first thing to test. `apps/assisted-disconnected-ui/docs/local-console.md`
documents a step-by-step procedure that exercises each lookup path independently, ending
in the `TakeControl` call that decides it.

### Root, and the VT

The entrypoint runs as uid 0. uid 1001 cannot work: it does not exist on the host, so
`sd_uid_get_display()` finds nothing, `TakeControl` from a non-owning uid would need a
polkit agent, and `/run/user/0` and the VT ioctls need root anyway. The image's `USER
1001` default and `CMD` are unchanged; console mode is opt-in via `--user 0 --entrypoint`.

VT 7, not Anaconda's VT 6: logind's `NAutoVTs=6` autospawns gettys on VTs 1-6 and
`ReserveVT=6` keeps tty6 for one. Anaconda can use 6 because it controls its own
`logind.conf`.

## Size

Measured from the RPMs, not estimated:

| Item | Installed |
|---|---|
| `firefox` | 341 MB (`libxul.so` alone is 196 MB) |
| `llvm-libs` | **268 MB** |
| `mesa-dri-drivers` | 42 MB |
| `gtk3` | 22 MB |
| fonts | ~26 MB |
| `mutter` + `gnome-kiosk` + schemas | ~18 MB |

The surprise is `llvm-libs`, not Firefox. `mesa-dri-drivers` hard-requires `libLLVM.so.2x`
and `mesa-libEGL` requires `mesa-dri-drivers`. Baremetal servers typically have an ASPEED
or Matrox BMC GPU with no 3D engine, so Mesa falls back to llvmpipe. It is unavoidable for
a GL-based compositor and it is the single largest component.

Firefox's 114 bundled langpacks (43 MB) are removed: the app is English-only
(`src/i18n.ts` pins `supportedLngs: ['en']`) and PatternFly self-hosts its webfonts.
Media codecs and `pingsender` are another ~13 MB that could go, at the cost of making
`rpm -V` fail; not worth it unless ART objects to the total.

The OVE ISO embeds the payload, so the ISO grows by the same amount.

## What is deliberately not handled

The UI's finalizer page (`ClusterPage.tsx`, `SingleClusterFinalizerPage.tsx`) keeps the
pre-fetched OpenShift console URL alive in the page after assisted-service disappears.
That is a remote-browser concern and is unreachable from the console: the rendezvous node
*is* the bootstrap node, so the reboot that triggers the finalizer page also takes down the
server, the container and the display together. The supervisor loop therefore restarts
Firefox only when Firefox itself exits, never because the backend stopped answering, and
the operator watches the install up to the reboot and no further.

## Risks

1. **The logind session lookup from inside a container.** Everything depends on it; see
   above. Fallbacks, in order of preference: ship a PAM wrapper in the image (a port of
   Anaconda's `run-in-new-session`); `setsid login -f root` on the VT, which runs the full
   PAM stack with no new code; or, if the uid→display path turns out to be the one that
   works, nothing further is needed.
2. **llvmpipe performance.** A PatternFly React app composited in software on a BMC GPU at
   1920×1080 may be unpleasant. Anaconda proves the stack runs; it does not prove this app
   is pleasant. Mitigated with `gfx.webrender.software`, `enable-animations=false`.
3. **Payload growth** of roughly 700-800 MB, and the same again on the ISO.
4. **A browser running as root on the console.** Acceptable on a throwaway installer node
   — the proxy container already holds the pull secret — but it is a real posture change,
   as is `--security-opt label=disable` on an SELinux-enforcing RHCOS node.
5. **No authentication.** Physical access to the console means full control of the
   install. Physical access to the rendezvous node is already decisive, but it should be
   stated rather than discovered in review.
6. **No CI builds `Containerfile.ocp`.** `.github/workflows/push-to-master.yaml` builds
   only `apps/assisted-ui/Containerfile`, so nothing here catches a broken console image.
   `console/Containerfile.console-dev` exists so the stack can at least be built and run
   locally from public bases.

Enabling `rhel-9-appstream-rpms` for this image in `openshift-eng/ocp-build-data` is a
prerequisite, but a routine one.

## Verification

Ordered so the cheapest step removes the most uncertainty.

1. `podman run --rm --entrypoint gnome-kiosk <image> --help-all` — confirms which flags the
   shipped version actually has, which is what the entrypoint probes for.
2. `--selftest` on the entrypoint — validates every mount, binary and variable, and names
   the specific remedy for each failure.
3. Headless smoke test. Mutter's `--headless` skips the logind launcher entirely, so the
   compositor, profile generation, Firefox-on-Wayland, fonts and the readiness probe can
   all be exercised in an unprivileged container with no DRM and no seat.
4. A VM with `--video virtio` and the example unit — this is where the logind question is
   settled, following the procedure in `docs/local-console.md`.
5. Bare metal with a BMC, for the llvmpipe performance question.
