import React from 'react';
import { getErrorMessage } from '../../common';
import { OlmCatalog, OlmCatalogOperator } from '../../common/api/assisted-service/olmCatalogTypes';
import OlmCatalogService from '../services/OlmCatalogService';

/** Keep in step with the maximum the API doc specifies for `limit`. */
export const OLM_OPERATOR_PAGE_SIZE = 50;

export type UseOlmCatalogResult = {
  catalog?: OlmCatalog;
  operators: OlmCatalogOperator[];
  totalCount: number;
  isLoading: boolean;
  isSearching: boolean;
  error?: string;
  setSearch: (search: string) => void;
  search: string;
};

/**
 * Loads the operator catalog for an OpenShift version.
 *
 * The endpoints do not exist in assisted-service yet, so a failure here is expected against a real
 * service. Callers must treat `error` as a warning and stay usable — see
 * `docs/api-design/ove-olm-operator-selection.md`.
 */
export const useOlmCatalog = (openshiftVersion: string | undefined): UseOlmCatalogResult => {
  const [catalog, setCatalog] = React.useState<OlmCatalog>();
  const [operators, setOperators] = React.useState<OlmCatalogOperator[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSearching, setIsSearching] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [search, setSearch] = React.useState('');

  // Load the catalog list once per OpenShift version.
  React.useEffect(() => {
    if (!openshiftVersion) {
      return;
    }

    let isStale = false;

    const fetchCatalog = async () => {
      setIsLoading(true);
      setError(undefined);
      try {
        const catalogs = await OlmCatalogService.listCatalogs(openshiftVersion);
        if (isStale) {
          return;
        }
        const firstCatalog = catalogs[0];
        setCatalog(firstCatalog);
        if (!firstCatalog) {
          setOperators([]);
          setTotalCount(0);
        }
      } catch (e) {
        if (!isStale) {
          setError(getErrorMessage(e));
        }
      } finally {
        if (!isStale) {
          setIsLoading(false);
        }
      }
    };

    void fetchCatalog();
    return () => {
      isStale = true;
    };
  }, [openshiftVersion]);

  // Reload the operator page whenever the catalog or the (debounced) search term changes.
  React.useEffect(() => {
    if (!openshiftVersion || !catalog) {
      return;
    }

    let isStale = false;
    setIsSearching(true);

    const fetchOperators = async () => {
      try {
        const { items, totalCount } = await OlmCatalogService.listOperators(catalog.id, {
          openshiftVersion,
          search: search || undefined,
          limit: OLM_OPERATOR_PAGE_SIZE,
        });
        if (isStale) {
          return;
        }
        setOperators(items);
        setTotalCount(totalCount);
        setError(undefined);
      } catch (e) {
        if (!isStale) {
          setError(getErrorMessage(e));
          setOperators([]);
          setTotalCount(0);
        }
      } finally {
        if (!isStale) {
          setIsSearching(false);
        }
      }
    };

    void fetchOperators();
    return () => {
      isStale = true;
    };
  }, [openshiftVersion, catalog, search]);

  return {
    catalog,
    operators,
    totalCount,
    isLoading,
    isSearching,
    error,
    search,
    setSearch,
  };
};
