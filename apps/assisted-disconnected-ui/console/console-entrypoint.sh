#!/bin/bash
#
# Local graphical console entrypoint for the assisted disconnected UI.
#
# Runs a gnome-kiosk Wayland compositor on the node's physical display and
# shows the disconnected UI in a locked-down full-screen Firefox, so that an
# operator standing at the rendezvous node can drive the install without a
# second machine on the network.
#
# This is NOT the image's default entrypoint. The default CMD still runs the
# Go proxy; a caller selects this script with `podman run --entrypoint`.
#
# It must run as uid 0, inside a container that has been given a logind
# session with a seat -- mutter can only become DRM master through logind's
# TakeControl/TakeDevice. See docs/local-console.md for the required podman
# flags and the host-side systemd unit.

set -u -o pipefail

CONSOLE_DIR=${CONSOLE_DIR:-/usr/libexec/assisted-disconnected-ui/console}
# shellcheck source=lib/log.sh
. "${CONSOLE_DIR}/lib/log.sh"
# shellcheck source=lib/probe.sh
. "${CONSOLE_DIR}/lib/probe.sh"

###############################################################################
# Configuration
###############################################################################

# These four mirror proxy/config/config.go so that the URL we open matches
# whatever the sibling server container was configured to serve.
: "${BRIDGE_PORT:=3001}"
: "${TLS_CERT:=}"
: "${TLS_KEY:=}"
: "${AIUI_CONSOLE_HOST:=127.0.0.1}"

: "${AIUI_CONSOLE_URL:=}"
: "${AIUI_CONSOLE_CA_CERT:=}"
: "${AIUI_CONSOLE_WAIT_TIMEOUT:=0}"         # seconds to show the splash; 0 = forever
: "${AIUI_CONSOLE_COMPOSITOR_TIMEOUT:=120}" # matches anaconda's inst.xtimeout default
: "${AIUI_CONSOLE_WAYLAND_DISPLAY:=assisted-console-0}"
: "${AIUI_CONSOLE_FIREFOX_ARGS:=}"
: "${AIUI_CONSOLE_HEADLESS:=0}"             # smoke test: no DRM, no seat, no logind
: "${AIUI_CONSOLE_VIRTUAL_MONITOR:=1280x1024}"

if [[ -z ${AIUI_CONSOLE_URL} ]]; then
  # config.go does BridgePort = ":" + BRIDGE_PORT, so a caller that sets
  # BRIDGE_PORT=":3001" is also valid. Strip any leading colon.
  port=${BRIDGE_PORT#:}
  # The proxy serves exactly one protocol, and only speaks TLS when both of
  # these are set (see server.Serve in proxy/server/server.go).
  if [[ -n ${TLS_CERT} && -n ${TLS_KEY} ]]; then
    scheme=https
  else
    scheme=http
  fi
  AIUI_CONSOLE_URL="${scheme}://${AIUI_CONSOLE_HOST}:${port}/"
fi

###############################################################################
# Preflight
###############################################################################

preflight() {
  local problems=0 binary

  for binary in gnome-kiosk firefox dbus-run-session; do
    if command -v "${binary}" >/dev/null 2>&1; then
      log "CHECK ${binary}: ok"
    else
      log "CHECK ${binary}: FAIL (not installed; console mode needs the .ocp image)"
      problems=$((problems + 1))
    fi
  done

  if [[ $(id -u) -ne 0 ]]; then
    log "CHECK uid: FAIL (uid $(id -u)); pass 'podman run --user 0'"
    problems=$((problems + 1))
  else
    log "CHECK uid: ok (0)"
  fi

  if [[ ${AIUI_CONSOLE_HEADLESS} == 1 ]]; then
    log "CHECK display: skipped (headless)"
  else
    if [[ -d /dev/dri ]]; then
      log "CHECK /dev/dri: ok ($(echo /dev/dri/card*))"
    else
      log "CHECK /dev/dri: FAIL (no DRM device; pass --privileged or --device /dev/dri)"
      problems=$((problems + 1))
    fi

    # gudev/libinput enumerate both the DRM device and the keyboard/mouse from
    # the udev database. Without this the display can come up with no input.
    if [[ -d /run/udev/data ]]; then
      log "CHECK /run/udev: ok"
    else
      log "CHECK /run/udev: FAIL (bind-mount /run/udev:ro or there will be no input devices)"
      problems=$((problems + 1))
    fi

    if [[ -S /run/dbus/system_bus_socket ]]; then
      log "CHECK system bus: ok"
    else
      log "CHECK system bus: FAIL (bind-mount /run/dbus/system_bus_socket for logind)"
      problems=$((problems + 1))
    fi

    if [[ -d /run/systemd/sessions ]]; then
      log "CHECK /run/systemd: ok"
    else
      log "CHECK /run/systemd: FAIL (bind-mount /run/systemd:ro for session lookup)"
      problems=$((problems + 1))
    fi

    # mutter 49 looks at $XDG_SESSION_ID first; mutter 40 falls back to
    # sd_uid_get_display(0), which only needs /run/systemd. So this is a
    # warning, not a failure.
    if [[ -n ${XDG_SESSION_ID:-} ]]; then
      log "CHECK XDG_SESSION_ID: ok (${XDG_SESSION_ID})"
    else
      log "CHECK XDG_SESSION_ID: unset -- relying on the uid->display session lookup"
    fi
  fi

  return "${problems}"
}

if [[ ${1:-} == --selftest ]]; then
  log "URL: ${AIUI_CONSOLE_URL}"
  preflight
  exit $?
fi

# Skipped on the dbus-run-session re-exec below, so the checks are logged once.
if [[ -z ${AIUI_CONSOLE_REEXEC:-} ]]; then
  log "UI URL: ${AIUI_CONSOLE_URL}"
  preflight || die "preflight failed; see docs/local-console.md for the required podman flags"
fi

###############################################################################
# Runtime directories (the rootfs may be read-only; everything lives in tmpfs)
###############################################################################

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/0}"
mkdir -p "${XDG_RUNTIME_DIR}" || die "cannot create ${XDG_RUNTIME_DIR}"
chmod 0700 "${XDG_RUNTIME_DIR}"

# gnome-kiosk 49 chdir()s to $HOME at startup, and Firefox wants somewhere to
# put its profile. Neither should be the read-only image rootfs.
export HOME="${XDG_RUNTIME_DIR}/home"
DOWNLOAD_DIR="${XDG_RUNTIME_DIR}/downloads"
mkdir -p "${HOME}" "${DOWNLOAD_DIR}"

export LANG=${LANG:-C.UTF-8}
export WAYLAND_DISPLAY="${AIUI_CONSOLE_WAYLAND_DISPLAY}"
# RHEL 9's org.gnome.Kiosk@wayland.service selects the backend purely from
# this (ConditionEnvironment=XDG_SESSION_TYPE=wayland, ExecStart with no
# flags). The host unit sets it too; default it for direct/dev runs.
export XDG_SESSION_TYPE="${XDG_SESSION_TYPE:-wayland}"

# mutter and GSettings' dconf backend both want a session bus. Re-exec under
# one rather than making the caller provide it.
if [[ -z ${DBUS_SESSION_BUS_ADDRESS:-} ]]; then
  log "re-exec under dbus-run-session"
  export AIUI_CONSOLE_REEXEC=1
  exec dbus-run-session -- "$0" "$@"
fi

###############################################################################
# Firefox profile
###############################################################################

PROFILE="${XDG_RUNTIME_DIR}/firefox-profile"
rm -rf "${PROFILE}"
mkdir -p "${PROFILE}"
sed "s|@DOWNLOAD_DIR@|${DOWNLOAD_DIR}|g" \
  "${CONSOLE_DIR}/firefox/user.js" >"${PROFILE}/user.js" ||
  die "cannot write ${PROFILE}/user.js"

if [[ -n ${AIUI_CONSOLE_CA_CERT} ]]; then
  if [[ ! -r ${AIUI_CONSOLE_CA_CERT} ]]; then
    log "WARNING: AIUI_CONSOLE_CA_CERT=${AIUI_CONSOLE_CA_CERT} is not readable"
  elif ! command -v certutil >/dev/null 2>&1; then
    log "WARNING: AIUI_CONSOLE_CA_CERT is set but certutil (nss-tools) is not installed"
  elif certutil -N -d "sql:${PROFILE}" --empty-password &&
    certutil -A -n assisted-console-ca -t 'CT,C,C' \
      -i "${AIUI_CONSOLE_CA_CERT}" -d "sql:${PROFILE}"; then
    log "trusted CA ${AIUI_CONSOLE_CA_CERT}"
  else
    log "WARNING: failed to import ${AIUI_CONSOLE_CA_CERT}"
  fi
fi

export MOZ_ENABLE_WAYLAND=1
export GDK_BACKEND=wayland
export MOZ_CRASHREPORTER_DISABLE=1

###############################################################################
# Compositor
###############################################################################

# gnome-kiosk itself only defines --version; every backend flag below comes
# from mutter's option table, and which ones exist varies by release (RHEL 9
# ships 40.0, RHEL 10 ships 49.0). Probe rather than guess -- older mutter
# refuses to start when handed an unknown flag.
kiosk_help=$(gnome-kiosk --help-all 2>&1)
kiosk_supports() { [[ ${kiosk_help} == *"--$1"* ]]; }

kiosk_args=(--wayland)
if kiosk_supports wayland-display; then
  kiosk_args+=(--wayland-display "${AIUI_CONSOLE_WAYLAND_DISPLAY}")
else
  # Fall back to mutter's default socket name.
  export WAYLAND_DISPLAY=wayland-0
  AIUI_CONSOLE_WAYLAND_DISPLAY=wayland-0
fi
# We never need X clients, so skip Xwayland entirely.
kiosk_supports no-x11 && kiosk_args+=(--no-x11)

if [[ ${AIUI_CONSOLE_HEADLESS} == 1 ]]; then
  # mutter's headless mode skips the logind launcher altogether, which makes
  # this runnable in CI with no seat, no DRM and no privileges.
  kiosk_args+=(--headless --virtual-monitor "${AIUI_CONSOLE_VIRTUAL_MONITOR}")
elif kiosk_supports display-server; then
  # "Run as a full display server, rather than nested". Redundant alongside
  # --wayland on mutter 49, but on mutter 40 it is what distinguishes taking
  # over the DRM device from running nested inside an existing compositor.
  kiosk_args+=(--display-server)
fi

log "starting compositor: gnome-kiosk ${kiosk_args[*]}"
gnome-kiosk "${kiosk_args[@]}" &
KIOSK_PID=$!

FIREFOX_PID=''
# shellcheck disable=SC2329 # invoked via trap
cleanup() {
  trap - EXIT INT TERM
  [[ -n ${FIREFOX_PID} ]] && kill -TERM "${FIREFOX_PID}" 2>/dev/null
  [[ -n ${KIOSK_PID} ]] && kill -TERM "${KIOSK_PID}" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

socket="${XDG_RUNTIME_DIR}/${AIUI_CONSOLE_WAYLAND_DISPLAY}"
for ((i = 0; i < AIUI_CONSOLE_COMPOSITOR_TIMEOUT * 10; i++)); do
  [[ -e ${socket} ]] && break
  kill -0 "${KIOSK_PID}" 2>/dev/null || die "gnome-kiosk exited before creating ${socket}"
  sleep 0.1
done
[[ -e ${socket} ]] ||
  die "timed out after ${AIUI_CONSOLE_COMPOSITOR_TIMEOUT}s waiting for ${socket}"
log "compositor ready (${socket})"

###############################################################################
# Browser
###############################################################################

start_firefox() { # $1 = url
  log "firefox --kiosk $1"
  # shellcheck disable=SC2086 # AIUI_CONSOLE_FIREFOX_ARGS is deliberately split
  firefox --kiosk --new-instance --no-remote \
    --profile "${PROFILE}" \
    ${AIUI_CONSOLE_FIREFOX_ARGS} \
    "$1" &
  FIREFOX_PID=$!
}

# Phase 1: show a splash while the server comes up. The Go proxy log.Fatal()s
# when assisted-service is unreachable, so it can crash-loop for a long time
# on a freshly booted node. A splash beats a Firefox network-error page.
if ! probe_url "${AIUI_CONSOLE_URL}"; then
  log "server not up yet; showing splash"
  start_firefox "file://${CONSOLE_DIR}/web/splash.html"
  wait_for_url "${AIUI_CONSOLE_URL}" "${AIUI_CONSOLE_WAIT_TIMEOUT}" ||
    log "WARNING: ${AIUI_CONSOLE_URL} never answered; opening it anyway"
  kill -TERM "${FIREFOX_PID}" 2>/dev/null
  wait "${FIREFOX_PID}" 2>/dev/null
  FIREFOX_PID=''
fi

# Phase 2: supervise Firefox, restarting it only if Firefox itself exits --
# never because the server stopped answering.
#
# The UI's finalizer page (ClusterPage.tsx) exists for a remote browser that
# outlives the backend. It is not reachable from here: this console runs on
# the rendezvous node, which is also the bootstrap node, so when it reboots to
# pivot, the server, this container and the display all go at once. There is
# no post-pivot state for us to preserve, and nothing to show afterwards.
while kill -0 "${KIOSK_PID}" 2>/dev/null; do
  start_firefox "${AIUI_CONSOLE_URL}"
  wait "${FIREFOX_PID}"
  rc=$?
  FIREFOX_PID=''
  log "firefox exited (rc=${rc}); restarting in 2s"
  sleep 2
done

die "gnome-kiosk exited; the container should be restarted"
