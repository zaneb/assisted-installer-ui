# OVE above-the-sea: OLM operator selection step

## Context

The OVE "above the sea" wizard (`disconnected-basic` → `disconnected-optional-configurations` →
`disconnected-review`) builds a disconnected ISO that has operator content baked into it. Today the
set of operators is **fixed**: `DisconnectedReviewStep.tsx` renders an expandable alert titled
"List of available operators" over the hardcoded `singleClusterOperators` array
(`libs/ui-lib/lib/common/config/constants.ts:317`). Users get what they are given.

We want users to choose. Specifically: a checkbox for the default operator set, plus the ability to
add arbitrary operators from an OLM catalog that assisted-service derives from the
[file-based catalog](https://olm.operatorframework.io/docs/reference/file-based-catalogs/) for the
OpenShift version being installed, picking a channel per operator (defaulting to the catalog's
`defaultChannel`).

**None of the assisted-service APIs for this exist yet.** So this change has two deliverables of
roughly equal weight: the UI, built against a proposed contract behind a feature flag; and a written
API design doc to take to the assisted-service team.

`openshift/mirror-gui` was evaluated as a source of reusable code and rejected — it publishes no
package, its operator UI is a single 2401-line component, and its data model (ImageSetConfiguration:
catalog → packages → channels[] → min/max version ranges) does not match ours (InfraEnv → operator →
one channel). It is not referenced in this design. Decision made 2026-10-30; please don't re-litigate.

## Decisions

| Decision | Choice |
|---|---|
| Step id / position | `disconnected-operators`, inserted **after** `disconnected-optional-configurations`, i.e. immediately before Review |
| "Default group" | The existing `singleClusterOperators` constant in v1. The API doc proposes an endpoint so it can become server-driven later |
| Persistence | **New** `olm_operators[]` + `include_default_operators` on InfraEnv — *not* the cluster-level `olmOperators`/`MonitoredOperator` path |
| Feature flag | `ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE`, default `false` |
| New dependency | `@patternfly/react-templates` (^6.4) in `libs/ui-lib` for `TypeaheadSelect` |

Why not the cluster-level `olmOperators` path: it is tempting (`steps/operators/Operators.tsx` already
does `olmOperators: names.map((name) => ({ name }))`) but it means "install this operator on the
cluster", which assisted-service acts on during installation. Baking packages into an ISO is a
different lifecycle. Conflating them yields a cluster that tries to install everything we mirrored.

## 1. Wizard wiring

**`libs/ui-lib/lib/ocm/components/wizard/utils/wizardTransition.ts`**
- Add `| 'disconnected-operators'` to the `ClusterWizardStepsType` union (~line 38).
- Add `const disconnectedOperatorsValidationsMap = buildEmptyValidationsMap();` alongside the other
  three (~line 329) and register it in `wizardStepsValidationsMap`.
- Leave `disconnectedSteps` (line 54) **unchanged** — see below.
- Leave `wizardStepsOrder` unchanged; it contains no disconnected steps and `isStepAfter` only runs
  on the connected path.

**`libs/ui-lib/lib/ocm/components/wizard/constants.ts`** — add `'disconnected-operators': 'Operators'`
to `wizardStepNames`. Both this and `wizardStepsValidationsMap` are total mapped types over the
union, so TS will fail loudly if either is missed.

**`libs/ui-lib/lib/ocm/components/wizard/clusterWizardContext/utils.ts`** — give
`getDisconnectedWizardStepIds` a second optional param and *insert* the step when the flag is on,
reusing the existing `addStepToClusterWizard` helper:

```ts
export const getDisconnectedWizardStepIds = (
  staticIpView?: StaticIpView | 'dhcp-selected',
  isOveOperatorsEnabled = false,
): ClusterWizardStepsType[] => {
  let copy = [...disconnectedSteps];
  if (isOveOperatorsEnabled) {
    copy = addStepToClusterWizard(copy, 'disconnected-optional-configurations', [
      'disconnected-operators',
    ]);
  }
  // ...existing static-ip insertion after 'disconnected-basic', unchanged
};
```

Inserting rather than adding to `disconnectedSteps` keeps `_wizardTransition.test.ts:454`
(`expect(getDisconnectedWizardStepIds()).toEqual(disconnectedSteps)`) meaningful, and makes flag-off
the fail-safe default.

**`libs/ui-lib/lib/ocm/components/wizard/clusterWizardContext/ClusterWizardContextProvider.tsx`** —
five touch points. Two of them currently bypass `getDisconnectedWizardStepIds` entirely and are the
easiest places to break this:
- line 46: `React.useState<ClusterWizardStepsType[]>(disconnectedSteps)` → `getDisconnectedWizardStepIds(undefined, isOveOperatorsEnabled)`
- line 199, inside `setInstallDisconnected`: `setDisconnectedWizardStepIds(disconnectedSteps)` → same call
- lines 121, 162, 174, 176: pass the flag through
- add `const isOveOperatorsEnabled = useFeature('ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE');` and add
  it to the `useMemo` dep array (line 210ff)

**`libs/ui-lib/lib/ocm/hooks/types.tsx`** — widen `AssistedInstallerFeatureType` to a union of two,
and add `ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE: false` to `STANDALONE_DEPLOYMENT_ENABLED_FEATURES`.

**`libs/ui-lib/lib/ocm/components/wizard/NewClusterWizard.tsx`** — add
`case 'disconnected-operators': return <DisconnectedOperatorsStep />;` to `getCurrentStep`.

**`.../steps/disconnected/index.tsx`** — `export * from './DisconnectedOperatorsStep';`

## 2. The step

New files under `libs/ui-lib/lib/ocm/components/wizard/steps/disconnected/`:

| File | Role |
|---|---|
| `DisconnectedOperatorsStep.tsx` | Formik wrapper + inner form |
| `operators/DefaultOperatorSetField.tsx` | the default-set checkbox |
| `operators/OperatorCatalogSelect.tsx` | typeahead over the catalog |
| `operators/SelectedOperatorsTable.tsx` | chosen operators + channel + remove |
| `operators/OperatorChannelSelect.tsx` | single-select channel picker |
| `operators/utils.ts` | pure helpers — the unit-test surface |
| `operators/index.tsx` | barrel |
| `DisconnectedOperatorsSummary.tsx` | review-step summary (§5) |

Follow `OptionalConfigurationsStep.tsx` exactly for the outer shape: exported `…Step` wrapping
`<Formik initialValues validationSchema onSubmit>`, inner `…Form` using `useFormikContext`, rendering
`<ClusterWizardStep navigation={<ClusterWizardNavigation />} footer={<ClusterWizardFooter onNext={() => void submitForm()} onBack={moveBack} … />}>`
around `<WithErrorBoundary title="Failed to load Operators step">` → `<Grid hasGutter>` →
`<Content component="h2">Operators</Content>`.

### Formik values

```ts
export type DisconnectedOperatorSelection = {
  packageName: string;
  channel: string;
  catalog: string;
};

type DisconnectedOperatorsValues = {
  includeDefaultOperators: boolean;
  selectedOperators: DisconnectedOperatorSelection[];
};
```

An array of objects rather than `Record<packageName, channel>`: Formik treats `.` in a field path as
nesting, and OLM package names routinely contain dots. All mutations go through a single
`setFieldValue('selectedOperators', next)` — the same approach `fields/OperatorCheckbox.tsx` and
`fields/OptionalOperatorsDropdown.tsx` already take. No per-row Formik field names.

`includeDefaultOperators` initialises to `true` when the InfraEnv carries no such field, preserving
today's behaviour for existing/legacy infra-envs.

### Components

- **`DefaultOperatorSetField`** — `CheckboxField` (`common/components/ui/formik/CheckboxField.tsx`)
  named `includeDefaultOperators`, label "Include the default operator set", with
  `body={<ExpandableSection toggleText={`Show the ${n} included operators`}>…}` listing the members.
  Members are `singleClusterOperators`; render titles via `useOperatorSpecs()`
  (`common/components/operators/operatorSpecs.tsx`), falling back to the raw key. Leave a comment
  pointing at the proposed default-group endpoint.
- **`OperatorCatalogSelect`** — `TypeaheadSelect` from `@patternfly/react-templates`. Debounce the
  filter ~300 ms and re-query with `search` when the catalog is server-paged; filter in memory when
  the whole page is cached. Cap rendered options at ~50 with a trailing non-selectable "Showing 50 of
  N — refine your search". Selecting appends `{ packageName, channel: op.defaultChannel, catalog }`.
- **`SelectedOperatorsTable`** — PatternFly `Table`, columns Operator (title + package name) /
  Channel / remove. Empty state when nothing is selected. If rows exceed the page size, use
  `usePagination` (`common/components/hosts/usePagination.ts`) with `wizardPerPage` /
  `setWizardPerPage` from the wizard context, as `StorageTable.tsx` does.
- **`OperatorChannelSelect`** — single-select `Select` + `MenuToggle`, structured like
  `steps/operators/fields/OptionalOperatorsDropdown.tsx` but without `hasCheckbox`. Suffix the
  catalog default with `(default)`. Disabled with a tooltip when there is only one channel.

### Why not reuse `OperatorsSelect`

`steps/operators/OperatorsSelect.tsx` renders every operator of every category as a `FormGroup` +
`Checkbox` + popover, driven by `getOperatorSpecs()` — a hand-curated map of ~30 operators with
bespoke descriptions, doc links and preflight hardware requirements. A real catalog index is
hundreds to thousands of packages. Reusing it would mount hundreds of popovers, leave 95% of packages
uncategorised, and drag in `selectCurrentClusterPermissionsState` / `selectIsCurrentClusterSNO` /
`useNewFeatureSupportLevel`, none of which are meaningful in the disconnected flow (there is no day-1
cluster in redux there).

So: reuse `useOperatorSpecs` **only** as a title/description lookup for known keys, and reuse the
`OptionalOperatorsDropdown` structure for the channel picker. The list itself is select-then-list,
not render-everything.

Related: do **not** add an `isDisconnected` prop to the existing `OperatorsStep.tsx`. Someone will
suggest it; it would make both flows worse.

### Loading, errors, submit

- `useOlmCatalog(openshiftVersion)` returns `{ catalog, isLoading, error }`. Render `<LoadingState />`
  in the body while loading, keeping the footer (as `BasicStep` does).
- On fetch failure or a 503 "catalog not synced": inline `Alert variant="warning"` — "Operator
  catalog unavailable. The ISO will be built with the default operator set." — and **leave Next
  enabled**. Hard-blocking the wizard on a brand-new optional endpoint is the biggest risk here.
- Submit mirrors `OptionalConfigurationsStep.handleNext`: `clearAlerts` → `setIsSubmitting(true)` →
  `OlmCatalogService.saveSelection(infraEnvId, values)` → `setDisconnectedInfraEnv(updated)` →
  `moveNext()`; `catch` → `handleApiError` + `addAlert({ variant: AlertVariant.danger })`; `finally`
  → `setIsSubmitting(false)`.
- Skip the PATCH entirely when nothing changed, so back/forward navigation is free and older
  services never see the unknown fields.

### Validation

```ts
Yup.object({
  includeDefaultOperators: Yup.boolean(),
  selectedOperators: Yup.array()
    .of(Yup.object({
      packageName: Yup.string().required(),
      channel: Yup.string().required('Select a channel'),
      catalog: Yup.string().required(),
    }))
    .max(100, 'At most 100 operators can be added to the ISO'),
});
```

The cap is a real guardrail — each operator adds to an ISO that is already 60+ GB. Add a soft
`Alert variant="warning"` past ~20 selections.

**Plain English strings only** — no `t('ai:…')` anywhere under `libs/ui-lib/lib/ocm/**`.

## 3. Client layer

**`libs/ui-lib/lib/common/api/assisted-service/OlmCatalogsAPI.ts`** — follow
`OfflineOpenshiftVersionsAPI.ts` (14 lines) exactly: object literal, `makeBaseURI()`, `client.get<T>`,
default export.

```ts
const OlmCatalogsAPI = {
  makeBaseURI() { return '/v2/olm-catalogs'; },
  list(openshiftVersion: string) { /* GET /v2/olm-catalogs?openshift_version= */ },
  listOperators(catalogId: string, params: { openshiftVersion: string; search?: string; limit?: number; offset?: number }) {},
  getOperator(catalogId: string, packageName: string, openshiftVersion: string) {},
};
```

`client` already prefixes `/api/assisted-install` and camelCases request/response **bodies**, so
write the interim types in camelCase — but build query strings with **snake_case** keys
(`openshift_version`), the way `InfraEnvsAPI.list` does with `cluster_id`. The case converter does
not touch URL strings.

**`libs/ui-lib/lib/common/api/assisted-service/olmCatalogTypes.ts`** — interim hand-written types with
a loud header saying these endpoints don't exist yet, naming the Jira and the design doc, and saying
to delete the file once the swagger change merges and
`yarn workspace @openshift-assisted/types run update:assisted-installer-service` has been run.
Covers `OlmCatalog`, `OlmOperatorChannel`, `OlmCatalogOperator`, `OlmOperatorList`,
`InfraEnvOlmOperator`, plus intersection types `InfraEnvWithOperators = InfraEnv & {…}` and
`InfraEnvOperatorUpdateParams = InfraEnvUpdateParams & {…}`.

Do **not** edit `libs/types/assisted-installer-service.d.ts` and do **not** write a `declare module`
augmentation for it. It is generated, `.cursor/rules/generated-sdks-and-types.mdc` forbids hand
edits, and a local intersection type is better anyway: it is obviously temporary and it breaks
loudly if upstream lands different field names.

**`libs/ui-lib/lib/ocm/services/OlmCatalogService.ts`** — owns the three awkward bits so they live in
one deletable file: the two `as` casts at the InfraEnv read/write boundary; a module-level
`Map` cache keyed by `` `${openshiftVersion}|${catalogId}|${search ?? ''}` `` (there is no React Query
or SWR in this repo and wizard steps remount on back/forward, so without it every navigation refetches
a multi-hundred-item list); and the mapping between catalog records and the Formik selection shape.

**`libs/ui-lib/lib/ocm/hooks/useOlmCatalog.ts`** — hand-rolled `useState`/`useEffect` hook modelled on
`ocm/hooks/useInfraEnv.ts`.

Registration, all of which are easy to forget:
- `common/api/assisted-service/index.ts` — `export { default as OlmCatalogsAPI } from './OlmCatalogsAPI';`
- `ocm/services/apis/index.ts` — re-list `OlmCatalogsAPI` by name
- `ocm/services/index.ts` — export `OlmCatalogService`
- `ocm/hooks/index.ts` — export `useOlmCatalog`
- `libs/ui-lib/package.json` — add `@patternfly/react-templates` (pin to the 6.4 line, matching the
  other `@patternfly/*` entries). It is a first-party PatternFly package, but ui-lib is consumed by
  OCM and ACM, so call the addition out explicitly in the PR description.

## 4. API design doc

New file: **`docs/api-design/ove-olm-operator-selection.md`**. `docs/` currently holds only process
docs and there is no API-design precedent, so this creates the directory. Head the doc with a note
that it is a **UI-side proposal** whose canonical home is an enhancement PR in
`openshift/assisted-service`, and link that PR once opened. Don't build an index until there are three.

Contents:

**Catalog discovery**
```
GET /v2/olm-catalogs?openshift_version=4.19
200 → [{ "id": "redhat-operators", "name": "Red Hat Operators",
         "index_image": "registry.redhat.io/redhat/redhat-operator-index:v4.19",
         "description": "...", "operator_count": 412,
         "digest": "sha256:…", "synced_at": "2026-10-28T09:12:00Z",
         "openshift_version": "4.19" }]
```

**Operator listing — paged and searchable by design, not as a nicety**
```
GET /v2/olm-catalogs/{catalog_id}/operators?openshift_version=4.19&search=metallb&limit=50&offset=0
200 → { "items": [{ "package_name": "metallb-operator",
                    "display_name": "MetalLB Operator",
                    "description": "...", "provider": "Red Hat",
                    "default_channel": "stable",
                    "channels": [{"name": "stable", "head_version": "4.19.0-202510", "deprecated": false}],
                    "in_default_group": true,
                    "deprecated": false }],
        "total_count": 412, "next_offset": 50, "digest": "sha256:…" }
```
`search` matches `package_name` and `display_name`, case-insensitive substring. `limit` default 50,
max 200. An unpaged full `community-operators` index is multiple MB of JSON per wizard visit.

**Single operator detail** — `GET /v2/olm-catalogs/{catalog_id}/operators/{package_name}?openshift_version=`
→ one operator plus `versions_by_channel: {channel: [version]}`.

**Default group** — `GET /v2/olm-operator-default-group?openshift_version=4.19` →
`[{ "package_name", "catalog", "channel" }]`. Not consumed in v1 (we use `singleClusterOperators`),
but specified now so the hardcoded list can move server-side without another API round trip.

**Dependencies (phase 2, document but don't implement)** —
`GET /v2/olm-catalogs/{catalog_id}/operators/{package_name}/dependencies` →
`{ "dependencies": [{"package_name", "version_range", "required_by"}], "count" }`. State explicitly
that **the service resolves dependencies when generating the ISO** and the UI only displays them;
client-side recursive resolution over hundreds of packages is not viable, and an ISO missing a
dependency is a silent failure at install time.

**FBC field mapping** — a table for the assisted-service implementers, since they are building the
Go-side extraction from scratch:

| Response field | FBC source |
|---|---|
| `package_name` | `olm.package` `.name` |
| `default_channel` | `olm.package` `.defaultChannel` |
| `description`, icon | `olm.package` `.description` / `.icon` |
| `channels[].name` | `olm.channel` `.name` |
| `channels[].head_version` | head `olm.channel` entry → matching `olm.bundle`'s `olm.package` property `.version` |
| `display_name`, `provider` | `olm.csv.metadata` property |
| `deprecated`, deprecation message | `olm.deprecations` entries, scoped to package / channel / bundle |
| dependencies | `olm.bundle` properties of type `olm.package.required` (`packageName`, `versionRange`) |

**Persistence — concrete swagger additions**
```yaml
definitions:
  infra-env-olm-operator:
    type: object
    required: [package_name]
    properties:
      package_name: {type: string, description: "OLM package name, e.g. metallb-operator"}
      channel:      {type: string, description: "Channel to include. Defaults to the catalog defaultChannel."}
      catalog:      {type: string, description: "Catalog id. Defaults to the service default catalog."}
      version:      {type: string, description: "Optional pinned bundle version. Defaults to channel head."}

  # added to infra-env, infra-env-create-params and infra-env-update-params:
  olm_operators:
    type: array
    items: {$ref: '#/definitions/infra-env-olm-operator'}
  include_default_operators: {type: boolean, default: true}
```

Semantics to spell out:
- `olm_operators` is **replace-on-PATCH** (whole array), matching `static_network_config`. Absent /
  `null` means unchanged; `[]` means none.
- `include_default_operators` defaults to `true`, preserving current behaviour.
- Only meaningful when `image_type == disconnected-iso`. Pick one of 400 or silently-ignore and
  document it — recommend **400**.
- Include `version` in the schema from day one even though the v1 UI won't expose a version picker:
  without it, ISO content silently changes when the catalog re-syncs, which is bad for
  reproducibility in exactly the disconnected environments this feature targets.

**Errors**

| Code | When |
|---|---|
| 400 | missing/invalid `openshift_version`; unknown `package_name`/`channel` for that version; `olm_operators` set on a non-`disconnected-iso` infra-env |
| 404 | unknown `catalog_id` or `package_name` |
| 409 | image already generated and immutable |
| 503 + `Retry-After` | catalog index not yet synced on this appliance |

The 503 matters: on a disconnected appliance the index is extracted at build or first-boot time, so
"not ready yet" is an expected state, and the UI must render it as a retryable warning, not an error.

**Caching / versioning** — catalog content is immutable for a given (index digest, OpenShift
version). Return `ETag: "<digest>"` and `Cache-Control: public, max-age=3600, must-revalidate`;
honour `If-None-Match` → 304. Surface `digest` and `synced_at` in bodies so the UI can show "catalog
synced <date>" and invalidate its own cache. Everything is keyed by `openshift_version`; no
cross-version sharing. All swagger changes are additive, so no API version bump — but the UI must
tolerate 404 from every new endpoint (older service).

## 5. Review step

In `DisconnectedReviewStep.tsx`, delete the module-level
`const opSpecs = getOperatorSpecs(() => undefined, true)` and the `singleClusterOperators` alert, and
render `<DisconnectedOperatorsSummary infraEnv={disconnectedInfraEnv} />` in its place. That
component:
- reads `olmOperators` / `includeDefaultOperators` through `OlmCatalogService`, keeping the cast in
  one place;
- renders `<Alert isInline isExpandable variant="info" title={`Operators included in this ISO (${total})`}>`
  — same visual idiom as today — with two sections, "Default operator set (N)" (only when included)
  and "Additional operators (M)" as `packageName — channel`;
- falls back to today's hardcoded list when the fields are absent entirely (old service, or flag off),
  so behaviour is unchanged;
- add an "Operators" `DescriptionListGroup` row with the count, beside OpenShift version / Rendezvous IP.

Also soften the adjacent `ISO size → "approx. 60+GB"` line to note that it grows with the selected
operators. A real `estimated_size_bytes` on the InfraEnv response is the proper fix; note it as a
follow-up in the API doc rather than doing it now.

## 6. Testing

**Vitest.** Existing unit tests here cover pure logic, not rendered components (there is no RTL
harness for OCM wizard steps). Follow that:
- `steps/disconnected/operators/utils.test.ts` — initial values from an InfraEnv (field present /
  absent / empty array); adding an operator defaults to its `defaultChannel`; a channel change
  replaces only that entry; dedupe when an operator is both in the default set and added manually;
  the "no change → no PATCH" diff helper.
- extend `utils/_wizardTransition.test.ts` — flag off leaves the list untouched; flag on inserts the
  step exactly once and immediately before `disconnected-review`; combinations with
  `StaticIpView.FORM` / `YAML` / `'dhcp-selected'`; `getWizardNavEntries` picks up the new title.
- a cheap guard asserting `wizardStepNames` and `wizardStepsValidationsMap` both have a
  `disconnected-operators` key.

**Cypress** (`libs/ui-lib-tests/cypress`) — greenfield, there is no disconnected coverage yet.
- fixtures `cypress/fixtures/olm-catalogs/{catalogs,operators-4.19,default-group}.json` (make the
  operator fixture ~120 entries so the option cap is exercised), plus a disconnected InfraEnv fixture
  carrying `olm_operators`.
- intercepts in `cypress/support/interceptors.ts` beside the existing `allInfraEnvsApiPath` block.
  **Since the endpoints don't exist, these fixtures are the only concrete artifact of the contract** —
  so write them in **snake_case** (wire format) and let the axios case converter do its job. They
  then double as something to hand the assisted-service team, and stay valid when the real endpoints
  land.
- a spec covering: default checkbox on by default → uncheck → PATCH body has
  `include_default_operators: false`; type "metal" → select → row appears with `stable` preselected;
  change channel → PATCH body reflects it; review step shows the counts; catalog 503 → warning shown
  and Next still works.

A dev-time stub server (Vite middleware / MSW) for `apps/assisted-ui` is explicitly **out of scope** —
possible follow-up if the endpoints stay unimplemented for long.

## 7. Risks

1. **Building UI before the contract is agreed.** Everything in §3 and §6 is a guess. The mitigation
   that actually matters: get §4 reviewed by assisted-service owners *before* the component work
   merges, and keep every guessed shape behind `OlmCatalogService` + `olmCatalogTypes.ts` so
   reconciliation is two files, not fifteen components.
2. **The two bypass sites** in `ClusterWizardContextProvider.tsx` (lines 46 and 199) are the most
   likely source of a "step silently missing" bug. Both are listed in §1.
3. **Catalog size.** Always send `limit` from the UI; never assume the service will cap it.
4. **Reproducibility.** Not pinning `version` means ISO content drifts on catalog re-sync. Schema
   supports it from v1 even though the UI doesn't expose it.
5. **ui-lib is a published library.** The new PatternFly dependency affects OCM and ACM bundles.

## 8. Verification

```bash
# from libs/ui-lib
yarn fix-code-style && yarn check_types
# from repo root
yarn check:types:all
yarn test:unit
# cypress
yarn workspace @openshift-assisted/ui-lib-tests test:run
```

Manual end-to-end:
1. Flip `ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE: true` in `STANDALONE_DEPLOYMENT_ENABLED_FEATURES`
   (`libs/ui-lib/lib/ocm/hooks/types.tsx`) locally.
2. `yarn build:all && yarn start:assisted_ui` → http://localhost:5173
3. New cluster → toggle "I'm installing on a disconnected/air-gapped/secured environment" on the
   Cluster details step → walk Basic information → Optional configurations → **Operators** → Review.
4. Confirm: the step appears in the left nav between Optional configurations and Review; the default
   checkbox is on; the catalog endpoints 404 against a real assisted-service, so the warning alert
   shows and **Next stays enabled**; the Review step falls back to the hardcoded list.
5. Toggle the disconnected switch off and on again — confirm the Operators step is still present
   (this exercises the line-199 bypass fix).
6. With the flag off, confirm the wizard is byte-for-byte unchanged.

Behaviour against the real contract is only verifiable through the Cypress intercepts until
assisted-service implements the endpoints.
