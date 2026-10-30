import { describe, expect, test } from 'vitest';
import { OlmCatalogOperator } from '../../../../../../common/api/assisted-service/olmCatalogTypes';
import {
  DisconnectedOperatorsValues,
  addOperator,
  getOperatorLabel,
  hasSelectionChanged,
  isOperatorSelected,
  removeOperator,
  setOperatorChannel,
  sortChannels,
  toFormikSelection,
  toInfraEnvOperators,
} from './utils';

const metallb: OlmCatalogOperator = {
  packageName: 'metallb-operator',
  displayName: 'MetalLB Operator',
  defaultChannel: 'stable',
  channels: [{ name: 'candidate' }, { name: 'stable' }, { name: 'alpha' }],
};

const odf: OlmCatalogOperator = {
  packageName: 'odf-operator',
  defaultChannel: 'stable-4.19',
  channels: [{ name: 'stable-4.19' }],
};

describe('toFormikSelection', () => {
  test('fills in a channel and catalog when the InfraEnv omits them', () => {
    expect(toFormikSelection([{ packageName: 'metallb-operator' }], 'redhat-operators')).toEqual([
      { packageName: 'metallb-operator', channel: '', catalog: 'redhat-operators' },
    ]);
  });

  test('preserves what the InfraEnv reports', () => {
    expect(
      toFormikSelection([
        { packageName: 'odf-operator', channel: 'stable-4.19', catalog: 'certified-operators' },
      ]),
    ).toEqual([
      { packageName: 'odf-operator', channel: 'stable-4.19', catalog: 'certified-operators' },
    ]);
  });

  test('maps an empty selection to an empty array', () => {
    expect(toFormikSelection([])).toEqual([]);
  });
});

describe('addOperator', () => {
  test('defaults the channel to the catalog defaultChannel', () => {
    expect(addOperator([], metallb, 'redhat-operators')).toEqual([
      { packageName: 'metallb-operator', channel: 'stable', catalog: 'redhat-operators' },
    ]);
  });

  test('is a no-op for an operator that is already selected', () => {
    const selection = addOperator([], metallb, 'redhat-operators');
    expect(addOperator(selection, metallb, 'redhat-operators')).toBe(selection);
  });

  test('appends without disturbing existing entries', () => {
    const selection = addOperator(
      addOperator([], metallb, 'redhat-operators'),
      odf,
      'redhat-operators',
    );
    expect(selection.map((entry) => entry.packageName)).toEqual([
      'metallb-operator',
      'odf-operator',
    ]);
  });
});

describe('setOperatorChannel', () => {
  test('replaces only the targeted entry', () => {
    const selection = addOperator(
      addOperator([], metallb, 'redhat-operators'),
      odf,
      'redhat-operators',
    );
    const updated = setOperatorChannel(selection, 'metallb-operator', 'candidate');
    expect(updated).toEqual([
      { packageName: 'metallb-operator', channel: 'candidate', catalog: 'redhat-operators' },
      { packageName: 'odf-operator', channel: 'stable-4.19', catalog: 'redhat-operators' },
    ]);
  });

  test('ignores an operator that is not selected', () => {
    const selection = addOperator([], metallb, 'redhat-operators');
    expect(setOperatorChannel(selection, 'absent-operator', 'candidate')).toEqual(selection);
  });
});

describe('removeOperator and isOperatorSelected', () => {
  test('removes the entry', () => {
    const selection = addOperator([], metallb, 'redhat-operators');
    expect(isOperatorSelected(selection, 'metallb-operator')).toBe(true);
    expect(removeOperator(selection, 'metallb-operator')).toEqual([]);
  });

  test('reports an absent operator as unselected', () => {
    expect(isOperatorSelected([], 'metallb-operator')).toBe(false);
  });
});

describe('hasSelectionChanged', () => {
  const base: DisconnectedOperatorsValues = {
    includeDefaultOperators: true,
    selectedOperators: [
      { packageName: 'metallb-operator', channel: 'stable', catalog: 'redhat-operators' },
    ],
  };

  test('is false for an identical selection', () => {
    expect(
      hasSelectionChanged(base, { ...base, selectedOperators: [...base.selectedOperators] }),
    ).toBe(false);
  });

  test('is true when the default set is toggled', () => {
    expect(hasSelectionChanged(base, { ...base, includeDefaultOperators: false })).toBe(true);
  });

  test('is true when a channel changes', () => {
    expect(
      hasSelectionChanged(base, {
        ...base,
        selectedOperators: [
          { packageName: 'metallb-operator', channel: 'candidate', catalog: 'redhat-operators' },
        ],
      }),
    ).toBe(true);
  });

  test('is true when an operator is added or removed', () => {
    expect(
      hasSelectionChanged(base, {
        ...base,
        selectedOperators: addOperator(base.selectedOperators, odf, 'redhat-operators'),
      }),
    ).toBe(true);
    expect(hasSelectionChanged(base, { ...base, selectedOperators: [] })).toBe(true);
  });

  test('is false when only the order changes', () => {
    const initial: DisconnectedOperatorsValues = {
      includeDefaultOperators: true,
      selectedOperators: [
        { packageName: 'metallb-operator', channel: 'stable', catalog: 'redhat-operators' },
        { packageName: 'odf-operator', channel: 'stable-4.19', catalog: 'redhat-operators' },
      ],
    };
    const reordered: DisconnectedOperatorsValues = {
      includeDefaultOperators: true,
      selectedOperators: [...initial.selectedOperators].reverse(),
    };
    expect(hasSelectionChanged(initial, reordered)).toBe(false);
  });
});

describe('toInfraEnvOperators', () => {
  test('round-trips through the Formik shape', () => {
    const operators = [
      { packageName: 'metallb-operator', channel: 'stable', catalog: 'redhat-operators' },
    ];
    expect(toInfraEnvOperators(toFormikSelection(operators))).toEqual(operators);
  });
});

describe('display helpers', () => {
  test('prefers the display name and falls back to the package name', () => {
    expect(getOperatorLabel(metallb)).toBe('MetalLB Operator');
    expect(getOperatorLabel(odf)).toBe('odf-operator');
  });

  test('sorts the default channel first, then alphabetically', () => {
    expect(sortChannels(metallb.channels, metallb.defaultChannel).map(({ name }) => name)).toEqual([
      'stable',
      'alpha',
      'candidate',
    ]);
  });
});
