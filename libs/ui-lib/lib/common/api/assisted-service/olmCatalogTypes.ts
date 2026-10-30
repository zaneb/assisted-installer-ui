/**
 * INTERIM TYPES — the endpoints these describe DO NOT EXIST in assisted-service yet.
 *
 * They are hand-written because `@openshift-assisted/types/assisted-installer-service` is generated
 * from assisted-service's swagger.yaml and cannot carry fields that have not been merged upstream.
 *
 * The proposed contract lives in `docs/api-design/ove-olm-operator-selection.md`.
 *
 * Once the swagger change merges:
 *   1. run `yarn workspace @openshift-assisted/types run update:assisted-installer-service`
 *   2. delete this file and import the generated types instead.
 *
 * Field names are camelCase because the shared axios `client` runs `axios-case-converter` over
 * request and response bodies. Query strings are NOT converted — build those with snake_case keys.
 */
import {
  InfraEnv,
  InfraEnvUpdateParams,
} from '@openshift-assisted/types/assisted-installer-service';

export type OlmCatalog = {
  id: string;
  name: string;
  indexImage: string;
  description?: string;
  operatorCount?: number;
  digest?: string;
  syncedAt?: string;
  openshiftVersion: string;
};

export type OlmOperatorChannel = {
  name: string;
  headVersion?: string;
  deprecated?: boolean;
};

export type OlmCatalogOperator = {
  packageName: string;
  displayName?: string;
  description?: string;
  provider?: string;
  defaultChannel: string;
  channels: OlmOperatorChannel[];
  inDefaultGroup?: boolean;
  deprecated?: boolean;
};

export type OlmOperatorList = {
  items: OlmCatalogOperator[];
  totalCount: number;
  nextOffset?: number;
  digest?: string;
};

export type OlmDefaultGroupEntry = {
  packageName: string;
  catalog?: string;
  channel?: string;
};

/** One operator baked into the generated disconnected ISO. */
export type InfraEnvOlmOperator = {
  packageName: string;
  channel?: string;
  catalog?: string;
  /** Optional pinned bundle version. Defaults to the head of the selected channel. */
  version?: string;
};

/**
 * Intersection rather than a `declare module` augmentation on purpose: this is obviously temporary,
 * and it fails loudly if upstream lands different field names.
 */
export type InfraEnvWithOperators = InfraEnv & {
  olmOperators?: InfraEnvOlmOperator[];
  includeDefaultOperators?: boolean;
};

export type InfraEnvOperatorUpdateParams = InfraEnvUpdateParams & {
  olmOperators?: InfraEnvOlmOperator[];
  includeDefaultOperators?: boolean;
};
