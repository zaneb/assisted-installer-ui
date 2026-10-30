# The Assisted Installer Disconnected User Interface

## Setting up a local dev-environment

- Start [assisted-service](https://github.com/openshift/assisted-service). You can run it
  [locally via podman](https://github.com/openshift/assisted-service/tree/master/deploy/podman)

- Start UI

```bash
 AIUI_APP_API_URL=<assised_service_url> yarn start:assisted_disconnected_ui
```

## Local graphical console

As well as being served over the network, the UI can be displayed on the rendezvous node's
own monitor. See [docs/local-console.md](docs/local-console.md).
