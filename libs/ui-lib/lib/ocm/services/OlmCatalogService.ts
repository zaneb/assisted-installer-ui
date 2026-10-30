import {
  InfraEnv,
  InfraEnvUpdateParams,
} from '@openshift-assisted/types/assisted-installer-service';
import OlmCatalogsAPI from '../../common/api/assisted-service/OlmCatalogsAPI';
import {
  InfraEnvOlmOperator,
  InfraEnvOperatorUpdateParams,
  InfraEnvWithOperators,
  OlmCatalog,
  OlmDefaultGroupEntry,
  OlmOperatorList,
} from '../../common/api/assisted-service/olmCatalogTypes';
import { InfraEnvsAPI } from './apis';

/**
 * Everything that depends on the not-yet-existing operator-catalog API is funnelled through this
 * service: the two casts at the InfraEnv boundary and the response cache. When assisted-service
 * ships the real endpoints, this file and `olmCatalogTypes.ts` are the only places that change.
 *
 * See `docs/api-design/ove-olm-operator-selection.md`.
 */

/**
 * Wizard steps remount on back/forward navigation and this repo has no React Query or SWR, so
 * without a cache every visit refetches a list that can run to hundreds of entries.
 */
const operatorListCache = new Map<string, OlmOperatorList>();

const makeCacheKey = (openshiftVersion: string, catalogId: string, search?: string) =>
  `${openshiftVersion}|${catalogId}|${search ?? ''}`;

const OlmCatalogService = {
  async listCatalogs(openshiftVersion: string): Promise<OlmCatalog[]> {
    const { data } = await OlmCatalogsAPI.list(openshiftVersion);
    return data;
  },

  async listOperators(
    catalogId: string,
    params: { openshiftVersion: string; search?: string; limit?: number; offset?: number },
  ): Promise<OlmOperatorList> {
    const isCacheable = !params.offset;
    const cacheKey = makeCacheKey(params.openshiftVersion, catalogId, params.search);

    if (isCacheable) {
      const cached = operatorListCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const { data } = await OlmCatalogsAPI.listOperators(catalogId, params);

    if (isCacheable) {
      operatorListCache.set(cacheKey, data);
    }
    return data;
  },

  async getDefaultGroup(openshiftVersion: string): Promise<OlmDefaultGroupEntry[]> {
    const { data } = await OlmCatalogsAPI.getDefaultGroup(openshiftVersion);
    return data;
  },

  clearCache() {
    operatorListCache.clear();
  },

  /** Reads the interim operator fields off an InfraEnv. The read-side cast lives here only. */
  readSelection(infraEnv: InfraEnv | undefined): {
    includeDefaultOperators: boolean;
    olmOperators: InfraEnvOlmOperator[];
    /** False when the service does not report the fields at all (old service, or never saved). */
    hasOperatorSelection: boolean;
  } {
    const withOperators = infraEnv as InfraEnvWithOperators | undefined;
    return {
      // Absent means "default set included", which preserves the behaviour from before this field.
      includeDefaultOperators: withOperators?.includeDefaultOperators ?? true,
      olmOperators: withOperators?.olmOperators ?? [],
      hasOperatorSelection: withOperators?.olmOperators !== undefined,
    };
  },

  /** Persists the selection onto the InfraEnv. The write-side cast lives here only. */
  async saveSelection(
    infraEnvId: InfraEnv['id'],
    selection: { includeDefaultOperators: boolean; olmOperators: InfraEnvOlmOperator[] },
  ): Promise<InfraEnv> {
    const params: InfraEnvOperatorUpdateParams = {
      includeDefaultOperators: selection.includeDefaultOperators,
      olmOperators: selection.olmOperators,
    };
    const { data } = await InfraEnvsAPI.update(infraEnvId, params as InfraEnvUpdateParams);
    return data;
  },
};

export default OlmCatalogService;
