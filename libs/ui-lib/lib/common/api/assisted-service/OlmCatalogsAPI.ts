import { client } from '../../api/axiosClient';
import {
  OlmCatalog,
  OlmCatalogOperator,
  OlmDefaultGroupEntry,
  OlmOperatorList,
} from './olmCatalogTypes';

/**
 * These endpoints do not exist in assisted-service yet.
 * See `docs/api-design/ove-olm-operator-selection.md` for the proposed contract.
 */
const OlmCatalogsAPI = {
  makeBaseURI() {
    return '/v2/olm-catalogs';
  },

  list(openshiftVersion: string) {
    return client.get<OlmCatalog[]>(OlmCatalogsAPI.makeBaseURI(), {
      params: { openshift_version: openshiftVersion },
    });
  },

  listOperators(
    catalogId: string,
    params: {
      openshiftVersion: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return client.get<OlmOperatorList>(`${OlmCatalogsAPI.makeBaseURI()}/${catalogId}/operators`, {
      params: {
        openshift_version: params.openshiftVersion,
        search: params.search,
        limit: params.limit,
        offset: params.offset,
      },
    });
  },

  getOperator(catalogId: string, packageName: string, openshiftVersion: string) {
    return client.get<OlmCatalogOperator>(
      `${OlmCatalogsAPI.makeBaseURI()}/${catalogId}/operators/${packageName}`,
      { params: { openshift_version: openshiftVersion } },
    );
  },

  getDefaultGroup(openshiftVersion: string) {
    return client.get<OlmDefaultGroupEntry[]>('/v2/olm-operator-default-group', {
      params: { openshift_version: openshiftVersion },
    });
  },
};

export default OlmCatalogsAPI;
