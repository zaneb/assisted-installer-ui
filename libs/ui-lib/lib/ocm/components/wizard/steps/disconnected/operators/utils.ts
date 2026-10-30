import {
  InfraEnvOlmOperator,
  OlmCatalogOperator,
} from '../../../../../../common/api/assisted-service/olmCatalogTypes';

/** One operator the user has chosen to bake into the ISO. */
export type DisconnectedOperatorSelection = {
  packageName: string;
  channel: string;
  catalog: string;
};

export type DisconnectedOperatorsValues = {
  includeDefaultOperators: boolean;
  selectedOperators: DisconnectedOperatorSelection[];
};

/**
 * An array of objects rather than a `Record<packageName, channel>`: Formik reads `.` in a field
 * path as nesting, and OLM package names routinely contain dots.
 */

export const toFormikSelection = (
  operators: InfraEnvOlmOperator[],
  fallbackCatalog = '',
): DisconnectedOperatorSelection[] =>
  operators.map(({ packageName, channel, catalog }) => ({
    packageName,
    channel: channel ?? '',
    catalog: catalog ?? fallbackCatalog,
  }));

export const toInfraEnvOperators = (
  selection: DisconnectedOperatorSelection[],
): InfraEnvOlmOperator[] =>
  selection.map(({ packageName, channel, catalog }) => ({
    packageName,
    channel,
    catalog,
  }));

export const isOperatorSelected = (
  selection: DisconnectedOperatorSelection[],
  packageName: string,
): boolean => selection.some((entry) => entry.packageName === packageName);

/** Adding an already-selected operator is a no-op rather than a duplicate row. */
export const addOperator = (
  selection: DisconnectedOperatorSelection[],
  operator: OlmCatalogOperator,
  catalog: string,
): DisconnectedOperatorSelection[] => {
  if (isOperatorSelected(selection, operator.packageName)) {
    return selection;
  }
  return [
    ...selection,
    {
      packageName: operator.packageName,
      channel: operator.defaultChannel,
      catalog,
    },
  ];
};

export const removeOperator = (
  selection: DisconnectedOperatorSelection[],
  packageName: string,
): DisconnectedOperatorSelection[] =>
  selection.filter((entry) => entry.packageName !== packageName);

export const setOperatorChannel = (
  selection: DisconnectedOperatorSelection[],
  packageName: string,
  channel: string,
): DisconnectedOperatorSelection[] =>
  selection.map((entry) => (entry.packageName === packageName ? { ...entry, channel } : entry));

/**
 * Lets the step skip the PATCH when nothing changed, so back/forward navigation is free and an
 * older assisted-service never sees the unknown fields.
 */
export const hasSelectionChanged = (
  initial: DisconnectedOperatorsValues,
  current: DisconnectedOperatorsValues,
): boolean => {
  if (initial.includeDefaultOperators !== current.includeDefaultOperators) {
    return true;
  }
  if (initial.selectedOperators.length !== current.selectedOperators.length) {
    return true;
  }
  const byPackage = new Map(initial.selectedOperators.map((entry) => [entry.packageName, entry]));
  return current.selectedOperators.some((entry) => {
    const previous = byPackage.get(entry.packageName);
    return !previous || previous.channel !== entry.channel || previous.catalog !== entry.catalog;
  });
};

/** Human-readable label for an operator, preferring the catalog's display name. */
export const getOperatorLabel = (operator: OlmCatalogOperator): string =>
  operator.displayName || operator.packageName;

export const sortChannels = (
  channels: OlmCatalogOperator['channels'],
  defaultChannel: string,
): OlmCatalogOperator['channels'] =>
  [...channels].sort((a, b) => {
    if (a.name === defaultChannel) {
      return -1;
    }
    if (b.name === defaultChannel) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
