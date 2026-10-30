import * as React from 'react';
import { Button, Content, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import MinusCircleIcon from '@patternfly/react-icons/dist/esm/icons/minus-circle-icon';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { OlmCatalogOperator } from '../../../../../../common/api/assisted-service/olmCatalogTypes';
import { OperatorChannelSelect } from './OperatorChannelSelect';
import { DisconnectedOperatorSelection, getOperatorLabel } from './utils';

type SelectedOperatorsTableProps = {
  selection: DisconnectedOperatorSelection[];
  /** Catalog metadata for the selected operators, keyed by package name. */
  operatorsByPackageName: Record<string, OlmCatalogOperator>;
  isDisabled?: boolean;
  onChannelChange: (packageName: string, channel: string) => void;
  onRemove: (packageName: string) => void;
};

export const SelectedOperatorsTable = ({
  selection,
  operatorsByPackageName,
  isDisabled,
  onChannelChange,
  onRemove,
}: SelectedOperatorsTableProps) => {
  if (!selection.length) {
    return (
      <EmptyState titleText="No additional operators" headingLevel="h4">
        <EmptyStateBody>
          Only the default operator set will be included. Use the search above to add more.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Table variant="compact" aria-label="Selected operators" data-testid="selected-operators-table">
      <Thead>
        <Tr>
          <Th width={50}>Operator</Th>
          <Th width={40}>Channel</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {selection.map((entry) => {
          const operator = operatorsByPackageName[entry.packageName];
          return (
            <Tr key={entry.packageName} data-testid={`selected-operator-${entry.packageName}`}>
              <Td dataLabel="Operator">
                <Content component="p">
                  {operator ? getOperatorLabel(operator) : entry.packageName}
                </Content>
                {operator && (
                  <Content component="small" className="pf-v6-u-color-200">
                    {entry.packageName}
                  </Content>
                )}
              </Td>
              <Td dataLabel="Channel">
                {operator ? (
                  <OperatorChannelSelect
                    packageName={entry.packageName}
                    channels={operator.channels}
                    defaultChannel={operator.defaultChannel}
                    selectedChannel={entry.channel}
                    isDisabled={isDisabled}
                    onChange={(channel) => onChannelChange(entry.packageName, channel)}
                  />
                ) : (
                  // The catalog entry is not in the current page of results, so we cannot offer
                  // alternatives. Show what was saved rather than an empty control.
                  <Content component="p">{entry.channel || '—'}</Content>
                )}
              </Td>
              <Td isActionCell>
                <Button
                  variant="plain"
                  icon={<MinusCircleIcon />}
                  isDisabled={isDisabled}
                  aria-label={`Remove ${entry.packageName}`}
                  data-testid={`remove-operator-${entry.packageName}`}
                  onClick={() => onRemove(entry.packageName)}
                />
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};
