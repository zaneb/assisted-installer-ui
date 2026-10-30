import * as React from 'react';
import { saveAs } from 'file-saver';
import { useNavigate } from 'react-router';
import {
  Alert,
  Grid,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  List,
  ListItem,
  ListComponent,
  OrderType,
  Content,
} from '@patternfly/react-core';
import {
  ClusterWizardStep,
  PULL_SECRET_INFO_LINK,
  WithErrorBoundary,
  ExternalLink,
  getDisconnectedDocsLink,
  getMajorMinorVersion,
  singleClusterOperators,
} from '../../../../../common';
import { OlmCatalogService } from '../../../../services';
import { ClusterWizardFooter, ClusterWizardNavigation } from '../../wizardComponents';
import { useClusterWizardContext } from '../../clusterWizardContext';
import { DisconnectedOperatorsSummary } from './DisconnectedOperatorsSummary';

export const DisconnectedReviewStep = () => {
  const { moveBack, disconnectedInfraEnv } = useClusterWizardContext();
  const openshiftVersion = disconnectedInfraEnv?.openshiftVersion;
  const navigate = useNavigate();

  const { includeDefaultOperators, olmOperators } =
    OlmCatalogService.readSelection(disconnectedInfraEnv);
  const operatorCount =
    (includeDefaultOperators ? singleClusterOperators.length : 0) + olmOperators.length;

  return (
    <ClusterWizardStep
      navigation={<ClusterWizardNavigation />}
      footer={
        <ClusterWizardFooter
          onNext={() => {
            saveAs(disconnectedInfraEnv?.downloadUrl ?? '');
            void navigate('/cluster-list');
          }}
          onBack={moveBack}
          nextButtonText="Download ISO"
        />
      }
    >
      <WithErrorBoundary title="Failed to load Review step">
        <Grid hasGutter>
          <Content component="h2">Review and download ISO</Content>
          <Alert isInline variant="info" title="ISO boot instructions">
            <List component={ListComponent.ol} type={OrderType.number}>
              <ListItem>Download the ISO.</ListItem>
              <ListItem>
                Boot your cluster's machines from this ISO and{' '}
                <ExternalLink
                  href={getDisconnectedDocsLink(getMajorMinorVersion(openshiftVersion))}
                >
                  follow instructions
                </ExternalLink>
                .
              </ListItem>
              <ListItem>
                Your <ExternalLink href={PULL_SECRET_INFO_LINK}>pull secret</ExternalLink> was
                included automatically. You can change it inside the installation wizard.
              </ListItem>
            </List>
          </Alert>
          <DisconnectedOperatorsSummary infraEnv={disconnectedInfraEnv} />
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>OpenShift version</DescriptionListTerm>
              <DescriptionListDescription>{openshiftVersion}</DescriptionListDescription>
            </DescriptionListGroup>
            {disconnectedInfraEnv?.rendezvousIp && (
              <DescriptionListGroup>
                <DescriptionListTerm>Rendezvous IP</DescriptionListTerm>
                <DescriptionListDescription>
                  {disconnectedInfraEnv.rendezvousIp}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
            {disconnectedInfraEnv?.additionalNtpSources && (
              <DescriptionListGroup>
                <DescriptionListTerm>NTP sources</DescriptionListTerm>
                <DescriptionListDescription>
                  {disconnectedInfraEnv.additionalNtpSources}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
            <DescriptionListGroup>
              <DescriptionListTerm>CPU architecture</DescriptionListTerm>
              <DescriptionListDescription>
                {disconnectedInfraEnv?.cpuArchitecture ?? 'x86_64'}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Operators</DescriptionListTerm>
              <DescriptionListDescription>{operatorCount}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>ISO size</DescriptionListTerm>
              <DescriptionListDescription>
                approx. 60+GB, and grows with the selected operators
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </Grid>
      </WithErrorBoundary>
    </ClusterWizardStep>
  );
};
