# OLM operator selection for the OVE disconnected ISO

**Status:** proposal — none of the endpoints below exist yet. **Audience:** the
`openshift/assisted-service` team.

> This is a **UI-side proposal**. Its canonical home is an enhancement PR against
> [`openshift/assisted-service`](https://github.com/openshift/assisted-service); this copy lives
> here so that the assisted-installer-ui work is reviewable before the upstream change merges. Once
> the swagger change lands, replace this document with a link to it.

## Problem

The OVE "above the sea" wizard (`Basic information` → `Optional configurations` →
`Review and download ISO`) produces a disconnected ISO with operator content baked in. The set of
operators is currently fixed: the UI hardcodes it in `singleClusterOperators`
(`libs/ui-lib/lib/common/config/constants.ts`) and merely _displays_ the list on the review step.

Users need to choose, because the ISO is large (60+ GB) and what goes into it determines what can
ever be installed in an air-gapped environment. Specifically they need to:

1. keep (or drop) the default operator set;
2. add arbitrary operators from the OLM catalog that matches the OpenShift version being installed;
3. pick a channel per operator, defaulting to the catalog's `defaultChannel`.

The UI cannot do (2) or (3) without assisted-service exposing catalog contents, and cannot do any of
it without somewhere to persist the choice.

## Scope

Four read endpoints for browsing catalog content, and two new fields on the InfraEnv to persist the
selection. A fifth endpoint (dependencies) is specified but explicitly deferred.

Everything is additive, so no API version bump. The UI tolerates `404` from every new endpoint and
degrades to the current behaviour, so an older service stays usable.

---

## Read endpoints

### `GET /v2/olm-catalogs`

Lists the catalogs available on this appliance for a given OpenShift version.

| Param               | Required | Notes                                                                                |
| ------------------- | -------- | ------------------------------------------------------------------------------------ |
| `openshift_version` | yes      | e.g. `4.19`. Catalog content is version-specific; there is no cross-version sharing. |

```json
[
  {
    "id": "redhat-operators",
    "name": "Red Hat Operators",
    "index_image": "registry.redhat.io/redhat/redhat-operator-index:v4.19",
    "description": "Red Hat certified operators",
    "operator_count": 412,
    "digest": "sha256:a1b2c3…",
    "synced_at": "2026-10-28T09:12:00Z",
    "openshift_version": "4.19"
  }
]
```

`digest` and `synced_at` let the UI show "catalog synced <date>" and invalidate its own cache.

### `GET /v2/olm-catalogs/{catalog_id}/operators`

Lists operators in a catalog. **Paging and search are part of the contract, not an optimisation.** A
full `community-operators` index is well over a thousand packages; returning it unpaged is multiple
megabytes of JSON on every visit to the wizard step.

| Param               | Required | Notes                                                                       |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `openshift_version` | yes      |                                                                             |
| `search`            | no       | Case-insensitive substring match against `package_name` and `display_name`. |
| `limit`             | no       | Default 50, maximum 200.                                                    |
| `offset`            | no       | Default 0.                                                                  |

```json
{
  "items": [
    {
      "package_name": "metallb-operator",
      "display_name": "MetalLB Operator",
      "description": "MetalLB is a load-balancer implementation for bare metal clusters.",
      "provider": "Red Hat",
      "default_channel": "stable",
      "channels": [
        { "name": "stable", "head_version": "4.19.0-202510", "deprecated": false },
        { "name": "candidate", "head_version": "4.20.0-202510", "deprecated": false }
      ],
      "in_default_group": true,
      "deprecated": false
    }
  ],
  "total_count": 412,
  "next_offset": 50,
  "digest": "sha256:a1b2c3…"
}
```

`next_offset` is omitted on the last page.

### `GET /v2/olm-catalogs/{catalog_id}/operators/{package_name}`

A single operator, for channel refresh and deep links. Same object as a listing item, plus:

```json
{
  "versions_by_channel": {
    "stable": ["4.19.0-202509", "4.19.0-202510"],
    "candidate": ["4.20.0-202510"]
  }
}
```

### `GET /v2/olm-operator-default-group`

The default operator set — what the UI's "Include the default operator set" checkbox controls.

| Param               | Required |
| ------------------- | -------- |
| `openshift_version` | yes      |

```json
[
  { "package_name": "kubevirt-hyperconverged", "catalog": "redhat-operators", "channel": "stable" },
  { "package_name": "metallb-operator", "catalog": "redhat-operators", "channel": "stable" }
]
```

**Not consumed in v1** — the UI keeps using its hardcoded `singleClusterOperators` list for now. It
is specified here so the list can move server-side later without a second round of API design. Doing
so is strictly better: today a change to the default set requires shipping a new UI release, and the
UI's list can silently drift from whatever the ISO builder actually includes.

Returning `package_name` is the load-bearing part of this endpoint — see the identifier mismatch
below.

#### The identifier mismatch, and why this endpoint resolves it

The default set and the catalog are currently described in **two different naming schemes**, and
nothing in the UI can translate between them:

|                                                                                      | Identifier                        | Example                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| Default set (`singleClusterOperators`, `libs/ui-lib/lib/common/config/constants.ts`) | assisted-service **operator key** | `cnv`, `lvm`, `mtv`, `metallb`                                                 |
| Catalog listing (`GET …/operators`)                                                  | OLM **package name**              | `kubevirt-hyperconverged`, `lvms-operator`, `mtv-operator`, `metallb-operator` |

The mapping is not derivable: `cnv` → `kubevirt-hyperconverged` shares no substring, several keys
map to packages whose names differ by more than a suffix, and the correspondence is knowledge that
lives in assisted-service, not in the catalog.

The consequence today is a real, user-visible defect, and the v1 UI does not hide it:

> If a user adds an operator from the catalog that the default set already contains, it is counted
> and listed twice on the review step — once under "Default operator set" by its operator key and
> once under "Additional operators" by its package name. The ISO itself is unaffected, since the
> service de-duplicates when it expands the default set, but the review step overstates what is
> being included.

We deliberately did not guess at a client-side mapping table. A hardcoded key→package map in the UI
would be a second source of truth that silently rots every time assisted-service adds an operator,
and getting it wrong means either hiding an operator the user did select or dropping one they needed
— in an air-gapped environment, discovered at install time.

Adopting this endpoint fixes it outright: once the default set is expressed in package names, the UI
can cross-reference the two lists, mark catalog entries that are already included
(`in_default_group` on the listing response exists for exactly this), and report an accurate total.
**This is the main reason to implement `GET /v2/olm-operator-default-group`, ahead of the
release-cadence argument above.**

### `GET /v2/olm-catalogs/{catalog_id}/operators/{package_name}/dependencies` — deferred

```json
{
  "dependencies": [
    {
      "package_name": "mcg-operator",
      "version_range": ">=4.19.0 <4.20.0",
      "required_by": "odf-operator"
    }
  ],
  "count": 1
}
```

Specified so the shape is agreed, but **not required for v1** and not consumed by the UI.

The important half of this is a statement of responsibility: **assisted-service resolves
dependencies when it generates the ISO.** The UI must not be the thing that gets this right.
Client-side recursive resolution across hundreds of packages means a fan-out of requests and a
guaranteed race with catalog updates, and an ISO that is missing a transitive dependency fails
silently — at install time, in an air-gapped environment, which is the worst possible place to
discover it. If this endpoint is implemented, the UI uses it only to _show_ users what else is
coming along.

---

## Deriving the responses from file-based catalogs

Catalog content comes from the OLM
[file-based catalog](https://olm.operatorframework.io/docs/reference/file-based-catalogs/) (FBC)
blobs in an index image's `/configs` tree. This table maps the response fields above onto their FBC
sources, since the extraction is being written from scratch.

| Response field                    | FBC source                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `package_name`                    | `olm.package` → `.name`                                                                                                      |
| `default_channel`                 | `olm.package` → `.defaultChannel`                                                                                            |
| `description`                     | `olm.package` → `.description`                                                                                               |
| `channels[].name`                 | `olm.channel` → `.name`                                                                                                      |
| `channels[].head_version`         | the channel head entry (the one no other entry `replaces`) → matching `olm.bundle` → its `olm.package` property → `.version` |
| `display_name`, `provider`        | `olm.bundle` → `olm.csv.metadata` property                                                                                   |
| `deprecated`, deprecation message | `olm.deprecations` entries, scoped to package / channel / bundle                                                             |
| `versions_by_channel`             | for each `olm.channel`, each entry's `olm.bundle` → `olm.package` property `.version`                                        |
| dependencies                      | `olm.bundle` properties of type `olm.package.required` → `.packageName`, `.versionRange`                                     |

Notes for implementers:

- A package is `{ exactly one olm.package, ≥1 olm.channel, ≥1 olm.bundle }`. The tuple (`schema`,
  `package`, `name`) is unique within a catalog.
- Prefer `olm.csv.metadata` over the deprecated `olm.bundle.object` property for display metadata —
  `olm.bundle.object` embeds base64 manifests and is a known performance problem when loading
  catalogs.
- Bundle ordering is semver on the `olm.package` property's `.version`, with the optional `release`
  field breaking ties (a bundle with a `release` outranks one without).
- Blobs may be JSON or YAML and are spread over a directory tree, conventionally one directory per
  package.

---

## Persisting the selection

The selection belongs on the **InfraEnv**, because the InfraEnv is what the ISO is generated from.

It deliberately does **not** reuse the cluster-level `olm_operators` / `monitored-operator` path.
That field means "install this operator on the cluster", and assisted-service acts on it during
installation. Baking packages into an ISO so they are _available_ to install later is a different
lifecycle. Conflating the two produces a cluster that tries to install everything that was mirrored.

### Swagger additions

```yaml
definitions:
  infra-env-olm-operator:
    type: object
    required: [package_name]
    properties:
      package_name:
        type: string
        description: OLM package name, e.g. metallb-operator.
      channel:
        type: string
        description: Channel to include. Defaults to the catalog's defaultChannel for this package.
      catalog:
        type: string
        description: Catalog id, e.g. redhat-operators. Defaults to the service's default catalog.
      version:
        type: string
        description: Optional pinned bundle version. Defaults to the head of the selected channel.

  # added to infra-env, infra-env-create-params and infra-env-update-params:
  olm_operators:
    type: array
    items:
      $ref: '#/definitions/infra-env-olm-operator'
    description: Operators to include in the generated disconnected ISO.

  include_default_operators:
    type: boolean
    default: true
    description: Whether the service's default operator set is included in the generated ISO.
```

### Semantics

- `olm_operators` is **replace-on-PATCH**: the whole array is substituted, matching how
  `static_network_config` already behaves. Absent or `null` means "leave unchanged"; `[]` means
  "none".
- `include_default_operators` defaults to `true`, which preserves today's behaviour for every
  existing InfraEnv.
- Both fields are only meaningful when `image_type == disconnected-iso`. Setting them otherwise
  should **`400`** rather than being silently ignored — a silently dropped operator selection is
  discovered only after a multi-hour ISO build.
- `version` should be in the schema from day one even though the v1 UI will not expose a version
  picker. Without it, the contents of an ISO change whenever the catalog re-syncs, which defeats
  reproducibility in precisely the disconnected, change-controlled environments this feature
  targets.

## Errors

| Code                  | When                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`                 | missing or invalid `openshift_version`; unknown `package_name` or `channel` for that version; `olm_operators` set on a non-`disconnected-iso` InfraEnv |
| `404`                 | unknown `catalog_id` or `package_name`                                                                                                                 |
| `409`                 | the image has already been generated and is immutable                                                                                                  |
| `503` + `Retry-After` | the catalog index has not been synced on this appliance yet                                                                                            |

All bodies use the existing `error` definition.

The `503` deserves attention. On a disconnected appliance the catalog index is extracted from the
index image at build or first-boot time, so "not ready yet" is an ordinary, expected state rather
than a fault. The UI renders it as a retryable warning and **keeps the wizard navigable** — a user
must never be unable to produce an ISO because an optional catalog listing is still warming up.

## Caching

Catalog content is immutable for a given (index image digest, OpenShift version), so it caches well:

- `ETag: "<digest>"` on all four read endpoints, honouring `If-None-Match` with `304`.
- `Cache-Control: public, max-age=3600, must-revalidate`.
- `digest` and `synced_at` in response bodies, so the client can invalidate its own in-memory cache
  and show the user how fresh the data is.

## Open questions

1. Which catalogs should be exposed? `redhat-operators` only, or also `certified-operators` and
   `community-operators`? This affects both ISO size and support posture.
2. Should the service report an estimated ISO size for a given selection? The review step currently
   states a flat "approx. 60+GB", which stops being true as soon as users add operators. An
   `estimated_size_bytes` field on the InfraEnv response would fix it properly.
3. Should selecting an operator whose dependencies are not in the chosen catalog be a `400`, or a
   warning surfaced in the response?
