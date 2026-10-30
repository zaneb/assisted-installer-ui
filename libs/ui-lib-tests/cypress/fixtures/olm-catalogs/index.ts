/**
 * Fixtures for the proposed OLM operator catalog API.
 *
 * These endpoints DO NOT EXIST in assisted-service yet, so these fixtures are currently the only
 * concrete artifact of the contract described in `docs/api-design/ove-olm-operator-selection.md`.
 *
 * They are deliberately written in **snake_case**, matching the wire format — the shared axios
 * client camelCases response bodies at runtime. Keeping them in wire format means they stay valid
 * once the real endpoints land, and can be handed to the assisted-service team as-is.
 */

export const olmCatalogOpenshiftVersion = '4.19';

export const olmCatalogs = [
  {
    id: 'redhat-operators',
    name: 'Red Hat Operators',
    index_image: 'registry.redhat.io/redhat/redhat-operator-index:v4.19',
    description: 'Red Hat certified operators',
    operator_count: 124,
    digest: 'sha256:8f2a1c0d9b7e4a63f5c81d2e0a9b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
    synced_at: '2026-10-28T09:12:00Z',
    openshift_version: olmCatalogOpenshiftVersion,
  },
];

type OlmOperatorFixture = {
  package_name: string;
  display_name: string;
  description: string;
  provider: string;
  default_channel: string;
  channels: { name: string; head_version?: string; deprecated?: boolean }[];
  in_default_group: boolean;
  deprecated: boolean;
};

/** A handful of realistic entries the specs assert against by name. */
const namedOperators: OlmOperatorFixture[] = [
  {
    package_name: 'metallb-operator',
    display_name: 'MetalLB Operator',
    description: 'A load-balancer implementation for bare metal clusters.',
    provider: 'Red Hat',
    default_channel: 'stable',
    channels: [
      { name: 'stable', head_version: '4.19.0-202510' },
      { name: 'candidate', head_version: '4.20.0-202510' },
      { name: 'alpha', head_version: '4.20.0-202509', deprecated: true },
    ],
    in_default_group: true,
    deprecated: false,
  },
  {
    package_name: 'metallb-extras',
    display_name: 'MetalLB Extras',
    description: 'Additional tooling for MetalLB.',
    provider: 'Community',
    default_channel: 'stable',
    channels: [{ name: 'stable', head_version: '0.3.1' }],
    in_default_group: false,
    deprecated: false,
  },
  {
    package_name: 'odf-operator',
    display_name: 'OpenShift Data Foundation',
    description: 'Software-defined storage for containers.',
    provider: 'Red Hat',
    default_channel: 'stable-4.19',
    channels: [{ name: 'stable-4.19', head_version: '4.19.2' }],
    in_default_group: false,
    deprecated: false,
  },
];

/**
 * Padding so the list is larger than one page, which exercises the
 * "Showing N of M — refine your search" branch of the typeahead.
 */
const paddingOperators: OlmOperatorFixture[] = Array.from({ length: 121 }, (_, index) => {
  const sequence = String(index).padStart(3, '0');
  return {
    package_name: `example-operator-${sequence}`,
    display_name: `Example Operator ${sequence}`,
    description: `Placeholder catalog entry ${sequence}.`,
    provider: 'Example',
    default_channel: 'stable',
    channels: [
      { name: 'stable', head_version: `1.${index}.0` },
      { name: 'preview', head_version: `2.${index}.0` },
    ],
    in_default_group: false,
    deprecated: false,
  };
});

export const olmCatalogOperators: OlmOperatorFixture[] = [...namedOperators, ...paddingOperators];

export const olmOperatorDefaultGroup = [
  { package_name: 'kubevirt-hyperconverged', catalog: 'redhat-operators', channel: 'stable' },
  { package_name: 'metallb-operator', catalog: 'redhat-operators', channel: 'stable' },
];

/** Mirrors the paging and search the API doc specifies. */
export const getOlmOperatorsResponse = ({
  search,
  limit = 50,
  offset = 0,
}: {
  search?: string;
  limit?: number;
  offset?: number;
}) => {
  const term = (search ?? '').trim().toLowerCase();
  const matching = term
    ? olmCatalogOperators.filter(
        (operator) =>
          operator.package_name.toLowerCase().includes(term) ||
          operator.display_name.toLowerCase().includes(term),
      )
    : olmCatalogOperators;

  const items = matching.slice(offset, offset + limit);
  const nextOffset = offset + limit;

  return {
    items,
    total_count: matching.length,
    ...(nextOffset < matching.length ? { next_offset: nextOffset } : {}),
    digest: olmCatalogs[0].digest,
  };
};
