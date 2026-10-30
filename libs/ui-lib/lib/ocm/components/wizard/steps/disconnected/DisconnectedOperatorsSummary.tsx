import * as React from 'react';
import { Alert, List, ListItem } from '@patternfly/react-core';
import { getOperatorSpecs, singleClusterOperators } from '../../../../../common';

const operatorSpecs = getOperatorSpecs(() => undefined, true);

const getOperatorTitle = (operatorKey: string): string => {
  const spec = Object.values(operatorSpecs)
    .flatMap((specs) => specs)
    .find((candidate) => candidate.operatorKey === operatorKey);
  return spec?.title ?? operatorKey;
};

export const DisconnectedOperatorsSummary = () => (
  <Alert isInline isExpandable variant="info" title="List of available operators">
    <List>
      {singleClusterOperators.map((operatorKey) => (
        <ListItem key={operatorKey}>{getOperatorTitle(operatorKey)}</ListItem>
      ))}
    </List>
  </Alert>
);
