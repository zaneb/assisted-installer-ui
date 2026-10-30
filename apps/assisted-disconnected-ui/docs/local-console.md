# Local graphical console

The disconnected UI is normally reached over the network: you point a browser on a second
machine at `http://<rendezvous-ip>:<port>/`. "Console mode" additionally renders the same
UI on the rendezvous node's own monitor, so an operator standing at the rack can drive the
install from the machine itself.

This is the same approach Anaconda uses to show its web UI locally.

## How it works

The `.ocp` container image carries a second entrypoint,
`/usr/libexec/assisted-disconnected-ui/console/console-entrypoint.sh`, which:

1. Derives the UI URL from `BRIDGE_PORT` / `TLS_CERT` / `TLS_KEY` — the same variables the
   Go proxy reads (`proxy/config/config.go`), so it opens whatever the server is serving.
2. Starts [`gnome-kiosk`](https://gitlab.gnome.org/GNOME/gnome-kiosk) as a Wayland
   compositor rendering directly to DRM/KMS.
3. Shows a splash page while the server comes up, then opens the UI in a locked-down
   full-screen Firefox and keeps it alive.

The default `CMD` is unchanged: by default the image still just runs the proxy. Console
mode is opt-in, selected by the caller with `podman run --entrypoint`.

### Why a Wayland compositor and not a framebuffer browser

Because no such thing is packaged. WPE WebKit's DRM backend (via `cog`) renders straight
to KMS with no compositor and would be the ideal fit, but `cog` and `wpewebkit` are not in
RHEL 9 or RHEL 10 — nor are `cage`, `weston`, `chromium` or `qtwebengine`. The only
RPM-packaged browser that can draw on a bare display is Firefox, and the only
RPM-packaged compositor that can host it is `gnome-kiosk`.

`gnome-kiosk` is not a GNOME desktop: it is mutter in kiosk mode, about 13 MB, with no
panel, dash, session manager or settings daemon.

## Running it

Console mode needs three things the ordinary server container does not: **root**, **a
logind session with a seat**, and **the host's device plumbing**.

The logind session is the awkward one. Mutter can only become DRM master by asking
`systemd-logind` for the device (`TakeControl`/`TakeDevice`); it has no libseat or
run-as-root fallback. So something must create a real session with a seat and a VT before
the compositor starts.

The recommended way is to let the host's systemd unit do it, with `PAMName=`:

- `PAMName=` + `TTYPath=` makes `pam_systemd` register the session,
- systemd merges `pam_getenvlist()` back into the unit environment, so `$XDG_SESSION_ID`
  is available to `ExecStart=` and can be forwarded into the container with
  `-e XDG_SESSION_ID`.

A complete, commented example is in [`../console/examples/`](../console/examples/):

| File | Install as |
|---|---|
| `assisted-console.service` | `/etc/systemd/system/assisted-console.service` |
| `pam.d/assisted-console` | `/etc/pam.d/assisted-console` |

### Required podman flags

| Flag | Why |
|---|---|
| `--user 0` | logind `TakeControl`, `/run/user/0` and VT ioctls all need uid 0. uid 1001 cannot work — it does not exist on the host, so `sd_uid_get_display()` finds nothing and `TakeControl` would need polkit. |
| `--network host` | the browser must reach the proxy on `127.0.0.1:${BRIDGE_PORT}` — default **3001**, *not* the `EXPOSE`d 8080. `--network container:<proxy>` also works. |
| `--privileged` | exposes the host `/dev` so `/dev/dri/card*` can be `stat()`ed for `TakeDevice` and `/dev/input/*` is visible to libinput. |
| `--security-opt label=disable` | RHCOS is SELinux-enforcing and `container_t` cannot reach the system bus socket, `/run/systemd` or the DRM nodes. Implied by `--privileged`, but state it so it survives someone dropping that. |
| `--security-opt seccomp=unconfined` | Firefox's content sandbox uses syscalls the default profile rejects. |
| `-v /run/systemd:/run/systemd:ro` | `sd_session_is_active()` / `sd_uid_get_display()` read `/run/systemd/sessions/*` and `/run/systemd/users/0`. |
| `-v /run/udev:/run/udev:ro` | **not optional** — gudev and libinput enumerate the DRM device *and* the keyboard and mouse from the udev database. Without it you can get a display with no input. |
| `-v /run/dbus/system_bus_socket:...` | the `org.freedesktop.login1` calls. |
| `--tmpfs /run/user/0:mode=0700` | `XDG_RUNTIME_DIR` must be writable and 0700; the image rootfs may not be. |
| `-e XDG_SESSION_ID` | mutter 49's first-choice session lookup. |

A finer-grained alternative to `--privileged`, worth moving to once it works:

```
--cap-add SYS_ADMIN,SYS_TTY_CONFIG,SYS_NICE,DAC_OVERRIDE
--device /dev/dri --device /dev/tty0 --device /dev/tty7
--device-cgroup-rule 'c 226:* rwm'   # drm
--device-cgroup-rule 'c 13:* rwm'    # input
-v /dev/input:/dev/input
--security-opt label=disable
```

### Which VT

VT **7**. logind's `NAutoVTs=6` autospawns gettys on VTs 1–6 and `ReserveVT=6` keeps tty6
available for one. Anaconda uses VT 6 because it controls its own `logind.conf`; we do
not. The example unit stops `getty@tty7` and `chvt`s to 7 before starting.

Nothing else should hold DRM master by then. `fbcon` is an in-kernel client and hands the
display over when a userspace master appears; `plymouth` does take master during boot,
hence `After=plymouth-quit-wait.service`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AIUI_CONSOLE_URL` | derived | Full URL to open. Overrides everything below. |
| `BRIDGE_PORT` | `3001` | Same variable the proxy uses. A leading `:` is stripped. |
| `TLS_CERT` / `TLS_KEY` | unset | If **both** are set the derived scheme is `https`. |
| `AIUI_CONSOLE_HOST` | `127.0.0.1` | |
| `AIUI_CONSOLE_CA_CERT` | unset | PEM imported into the Firefox profile with `certutil`. |
| `AIUI_CONSOLE_WAIT_TIMEOUT` | `0` | Seconds to show the splash before opening the URL anyway. `0` waits forever. |
| `AIUI_CONSOLE_COMPOSITOR_TIMEOUT` | `120` | Matches Anaconda's `inst.xtimeout` default. |
| `AIUI_CONSOLE_HEADLESS` | `0` | Smoke-test mode: no DRM, no seat, no logind. |
| `AIUI_CONSOLE_VIRTUAL_MONITOR` | `1280x1024` | Resolution for headless mode. |
| `AIUI_CONSOLE_FIREFOX_ARGS` | unset | Extra Firefox arguments. |

**Prefer plain HTTP on loopback.** The proxy serves exactly one protocol, so setting
`TLS_CERT`/`TLS_KEY` means the operator meets a self-signed-certificate interstitial on a
machine where they cannot install a CA. If TLS is mandatory, also pass
`AIUI_CONSOLE_CA_CERT`.

## Checking a deployment

The entrypoint has a preflight mode that validates every mount and variable above and
prints a specific diagnosis, without starting anything:

```bash
podman run --rm ... --entrypoint /usr/libexec/assisted-disconnected-ui/console/console-entrypoint.sh \
    <image> --selftest
```

### Verifying the session plumbing

Whether mutter can take DRM master from inside a container comes down to whether it can
resolve a logind session. It has three lookup paths and tries them in order, so test them
individually — a bare "it didn't work" does not tell you which hop failed.

**On the host first.** Make sure nothing else owns seat0: a VM that boots to
`graphical.target` has GDM holding it.

```bash
systemctl isolate multi-user.target        # or: systemctl stop gdm
systemctl start assisted-console.service
loginctl list-sessions
loginctl show-session <id> -p Id -p Seat -p VTNr -p Type -p Class -p Active -p State
```

Expect `Seat=seat0`, `VTNr=7`, `Type=wayland`, `Class=user`, `Active=yes`. A session that
is not on the foreground VT starts paused, which is what `chvt 7` in the unit is for.

**Then from inside the container.** Exec a shell alongside the running console and work
down the same ladder mutter does. (These use `dbus-send` from `dbus-tools`, which is in
the image; `busctl` is not, as that would mean pulling in `systemd`.)

```bash
podman exec -it assisted-console bash

# Path 1 (mutter 49 first choice): the forwarded session id.
echo "${XDG_SESSION_ID}"
dbus-send --system --print-reply --dest=org.freedesktop.login1 \
    /org/freedesktop/login1 \
    org.freedesktop.login1.Manager.GetSession string:"${XDG_SESSION_ID}"

# Path 2 (mutter 49 second choice): resolve by caller PID. logind reads the PID
# from the bus connection, then maps it via cgroup -- so this is the one that
# needs --pid=host and/or --cgroups=disabled to resolve.
dbus-send --system --print-reply --dest=org.freedesktop.login1 \
    /org/freedesktop/login1 \
    org.freedesktop.login1.Manager.GetSessionByPID uint32:0

# Path 3 (mutter 40's fallback, and 49's last resort): the uid's display
# session, read straight out of the bind-mounted /run/systemd.
grep DISPLAY= /run/systemd/users/0
```

**Any one** of these succeeding is enough. Path 3 is the one that should work without any
namespace sharing, and it is why `-v /run/systemd:/run/systemd:ro` is mandatory.

**The decisive check** is whether logind will actually hand over control. This is the
exact call mutter makes, and it needs no privileges beyond what the container already has:

```bash
# Use the object path returned by whichever lookup above succeeded.
dbus-send --system --print-reply --dest=org.freedesktop.login1 \
    /org/freedesktop/login1/session/_3<n> \
    org.freedesktop.login1.Session.TakeControl boolean:false
```

An empty reply means success — mutter will work. `TakeControl` is exclusive, but
`dbus-send` drops the connection immediately, which releases it.

| Result | Meaning |
|---|---|
| empty reply | session plumbing is good; any remaining failure is DRM/driver, not logind |
| `AccessDenied` | uid mismatch — the container is not running as uid 0, or the session belongs to another user |
| `NoSuchSession` | the lookup returned a stale or wrong id |
| `Device or resource busy` on the subsequent run | something else still holds DRM master (GDM, plymouth, another compositor) |

If the lookups all fail, get mutter's own view of it:

```bash
podman exec -e G_MESSAGES_DEBUG=all assisted-console gnome-kiosk --wayland --display-server
```

### Smoke test with no hardware

Mutter's headless mode skips the logind launcher entirely, so the whole stack — compositor,
profile generation, Firefox on Wayland, fonts, the readiness probe — can be exercised in an
ordinary unprivileged container:

```bash
podman run --rm --user 0 --network host \
    --tmpfs /run/user/0:mode=0700 --tmpfs /tmp \
    -e AIUI_CONSOLE_HEADLESS=1 \
    -e AIUI_CONSOLE_URL=http://127.0.0.1:3001/ \
    --entrypoint /usr/libexec/assisted-disconnected-ui/console/console-entrypoint.sh \
    <image>
```

### Iterating locally

[`../console/Containerfile.console-dev`](../console/Containerfile.console-dev) builds the
same console stack on public CentOS Stream, so you do not need
`registry.ci.openshift.org` credentials or a full UI rebuild.

### Journal messages worth recognising

| Message | Cause |
|---|---|
| `Failed to find any matching session` | session lookup failed — check `/run/systemd` is mounted and the container runs as uid 0 |
| `Could not take control of session` | uid mismatch, or no polkit agent for a non-root session |
| `No GPUs found` | `/run/udev` not mounted, or no `/dev/dri` |
| display comes up but keyboard is dead | `/run/udev` not mounted |

## Known limitations

- **RHEL 9 vs RHEL 10.** RHEL 9 ships `gnome-kiosk` 40.0, RHEL 10 ships 49.0. The
  entrypoint probes `gnome-kiosk --help-all` and adapts, because the available flags
  differ. RHEL 9's packaging does support this combination — `gnome-kiosk` ships
  `org.gnome.Kiosk@wayland.service`, and `gnome-kiosk-search-appliance` is a shipped
  Wayland session that runs `gnome-kiosk` plus `firefox --kiosk` at a URL. What differs
  here is that we launch the compositor directly from a container rather than through GDM
  and `gnome-session`.
- **Software rendering.** Baremetal servers usually have an ASPEED or Matrox BMC GPU with
  no 3D engine, so Mesa falls back to llvmpipe. That is also why `llvm-libs` (268 MB) is
  the largest single component of console mode.
- **The browser runs as root.** Acceptable on a throwaway installer node — the proxy
  container already holds the pull secret — but worth knowing.
- **No authentication.** Physical access to the console means full control of the install.
- **The console ends at the pivot.** This runs on the rendezvous node, which is also the
  bootstrap node, so when it reboots to pivot the server, the container and the display all
  go at once. The operator watches the install up to the reboot and no further; the UI's
  finalizer page is only ever seen by a remote browser, which outlives the backend in a way
  the local console cannot.
- **Console mode is only in the `.ocp` image.** `Containerfile` targets `ubi9/ubi-micro`,
  which has no package manager.
