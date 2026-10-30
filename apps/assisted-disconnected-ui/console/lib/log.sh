# shellcheck shell=bash
# Logging helpers for the local graphical console entrypoint.
#
# Output goes to stderr so that it lands in the journal when the container is
# run from a systemd unit, and on the VT when it is run by hand.

log() {
  printf '%s console: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

die() {
  log "FATAL: $*"
  exit 1
}
