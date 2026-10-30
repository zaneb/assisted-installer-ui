import * as React from 'react';
import { Alert, Content, List, ListItem } from '@patternfly/react-core';
import { InfraEnv } from '@openshift-assisted/types/assisted-installer-service';
import { getOperatorSpecs, singleClusterOperators } from '../../../../../common';
import { OlmCatalogService } from '../../../../services';

const operatorSpecs = getOperatorSpecs(() => undefined, true);

const getOperatorTitle = (operatorKey: string): string => {
  const spec = Object.values(operatorSpecs)
    .flatMap((specs) => specs)
    .find((candidate) => candidate.operatorKey === operatorKey);
  return spec?.title ?? operatorKey;
};

/**
 * Data-driven on purpose: it renders whatever the InfraEnv reports and falls back to the hardcoded
 * list when the operator fields are absent, so it behaves correctly whether or not the Operators
 * step is enabled and whether or not assisted-service knows about these fields.
 *
 * KNOWN LIMITATION: an operator that is both in the default set and picked from the catalog is
 * listed and counted twice here — once by its assisted-service operator key, once by its OLM
 * package name — because those two identifier schemes cannot be reconciled client-side. The ISO is
 * unaffected (the service de-duplicates when expanding the default set); only this summary
 * overstates the total. See the "identifier mismatch" section of
 * docs/api-design/ove-olm-operator-selection.md.
 */
export const DisconnectedOperatorsSummary = ({ infraEnv }: { infraEnv?: InfraEnv }) => {
  const { includeDefaultOperators, olmOperators, hasOperatorSelection } =
    OlmCatalogService.readSelection(infraEnv);

  if (!hasOperatorSelection) {
    return (
      <Alert isInline isExpandable variant="info" title="List of available operators">
        <List>
          {singleClusterOperators.map((operatorKey) => (
            <ListItem key={operatorKey}>{getOperatorTitle(operatorKey)}</ListItem>
          ))}
        </List>
      </Alert>
    );
  }

  const defaultCount = includeDefaultOperators ? singleClusterOperators.length : 0;
  const total = defaultCount + olmOperators.length;

  return (
    <Alert
      isInline
      isExpandable
      variant="info"
      title={`Operators included in this ISO (${total})`}
      data-testid="disconnected-operators-summary"
    >
      {includeDefaultOperators && (
        <>
          <Content component="p" className="pf-v6-u-font-weight-bold">
            {`Default operator set (${defaultCount})`}
          </Content>
          <List>
            {singleClusterOperators.map((operatorKey) => (
              <ListItem key={operatorKey}>{getOperatorTitle(operatorKey)}</ListItem>
            ))}
          </List>
        </>
      )}
      {olmOperators.length > 0 && (
        <>
          <Content component="p" className="pf-v6-u-font-weight-bold pf-v6-u-mt-sm">
            {`Additional operators (${olmOperators.length})`}
          </Content>
          <List>
            {olmOperators.map(({ packageName, channel }) => (
              <ListItem key={packageName}>
                {channel ? `${packageName} — ${channel}` : packageName}
              </ListItem>
            ))}
          </List>
        </>
      )}
      {!includeDefaultOperators && olmOperators.length === 0 && (
        <Content component="p">No operators will be included in this ISO.</Content>
      )}
    </Alert>
  );
};
