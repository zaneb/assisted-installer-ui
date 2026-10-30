import * as React from 'react';
import { ExpandableSection, List, ListItem } from '@patternfly/react-core';
import { CheckboxField, getOperatorSpecs, singleClusterOperators } from '../../../../../../common';

/**
 * `getOperatorSpecs` is called outside the component with a no-op support-level getter, matching
 * `DisconnectedReviewStep`: `useOperatorSpecs()` needs the feature-support-level context, which the
 * disconnected wizard does not mount.
 */
const operatorSpecs = getOperatorSpecs(() => undefined, true);

const getOperatorTitle = (operatorKey: string): string => {
  const spec = Object.values(operatorSpecs)
    .flatMap((specs) => specs)
    .find((candidate) => candidate.operatorKey === operatorKey);
  return spec?.title ?? operatorKey;
};

/**
 * The default set is currently the hardcoded `singleClusterOperators` list.
 *
 * IDENTIFIER MISMATCH: `singleClusterOperators` holds assisted-service operator keys ('cnv',
 * 'lvm'), whereas the catalog lists OLM package names ('kubevirt-hyperconverged',
 * 'lvms-operator'). The mapping is not derivable, so the UI cannot tell whether an operator picked
 * from the catalog is already in the default set — which is why a duplicate is counted twice on the
 * review step. Deliberately not worked around with a hardcoded mapping table here; that would be a
 * second source of truth that rots silently.
 *
 * Resolved by adopting `GET /v2/olm-operator-default-group`, which returns package names. See the
 * "identifier mismatch" section of docs/api-design/ove-olm-operator-selection.md.
 */
export const DefaultOperatorSetField = () => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <CheckboxField
      name="includeDefaultOperators"
      label="Include the default operator set"
      helperText="These operators are always available to install from the generated ISO. Clear this to build a smaller ISO containing only the operators you choose below."
      body={
        <ExpandableSection
          toggleText={`Show the ${singleClusterOperators.length} included operators`}
          onToggle={() => setIsExpanded(!isExpanded)}
          isExpanded={isExpanded}
          data-testid="default-operator-set-section"
        >
          <List>
            {singleClusterOperators.map((operatorKey) => (
              <ListItem key={operatorKey}>{getOperatorTitle(operatorKey)}</ListItem>
            ))}
          </List>
        </ExpandableSection>
      }
    />
  );
};
