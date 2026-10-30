# Local graphical console

Renders the disconnected UI on the rendezvous node's own monitor, instead of only over the
network, so the install can be driven from the machine itself.

Full documentation — how to run it, the podman flags it needs and why, and its known
limitations — is in [`../docs/local-console.md`](../docs/local-console.md).

```
console-entrypoint.sh    the entrypoint; `--selftest` validates a deployment
lib/                     logging and the readiness probe
firefox/policies.json    enterprise policy, baked to /etc/firefox/policies/
firefox/user.js          profile prefs, copied into a fresh profile at runtime
gsettings/               compositor settings, compiled into the GSettings schemas
web/splash.html          shown while the UI server is still starting
examples/                host-side systemd unit and PAM stack (reference only,
                         for whoever owns the node's Ignition config)
Containerfile.console-dev  public-base build for local iteration
```

Everything here except `examples/` and `Containerfile.console-dev` is copied into the
`.ocp` image at `/usr/libexec/assisted-disconnected-ui/console/`.
