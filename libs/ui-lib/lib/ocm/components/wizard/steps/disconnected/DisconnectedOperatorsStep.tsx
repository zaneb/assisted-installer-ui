import * as React from 'react';
import * as Yup from 'yup';
import { Formik, useFormikContext } from 'formik';
import {
  Alert,
  AlertVariant,
  Content,
  Form,
  Grid,
  GridItem,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import {
  ClusterWizardStep,
  LoadingState,
  WithErrorBoundary,
  getApiErrorMessage,
  getFormikErrorFields,
  handleApiError,
  useAlerts,
} from '../../../../../common';
import { OlmCatalogOperator } from '../../../../../common/api/assisted-service/olmCatalogTypes';
import { useOlmCatalog } from '../../../../hooks';
import { OlmCatalogService } from '../../../../services';
import { useClusterWizardContext } from '../../clusterWizardContext';
import { ClusterWizardFooter, ClusterWizardNavigation } from '../../wizardComponents';
import {
  DefaultOperatorSetField,
  DisconnectedOperatorSelection,
  DisconnectedOperatorsValues,
  OperatorCatalogSelect,
  SelectedOperatorsTable,
  addOperator,
  hasSelectionChanged,
  removeOperator,
  setOperatorChannel,
  toFormikSelection,
  toInfraEnvOperators,
} from './operators';

/** Each operator adds to an ISO that is already 60+ GB, so the cap is a real guardrail. */
const MAX_OPERATORS = 100;
const MANY_OPERATORS_WARNING_THRESHOLD = 20;

const validationSchema = Yup.object({
  includeDefaultOperators: Yup.boolean(),
  selectedOperators: Yup.array()
    .of(
      Yup.object({
        packageName: Yup.string().required(),
        channel: Yup.string().required('Select a channel'),
        catalog: Yup.string().required(),
      }),
    )
    .max(MAX_OPERATORS, `At most ${MAX_OPERATORS} operators can be added to the ISO`),
});

type DisconnectedOperatorsFormProps = {
  isSubmitting: boolean;
  openshiftVersion?: string;
};

const DisconnectedOperatorsForm = ({
  isSubmitting,
  openshiftVersion,
}: DisconnectedOperatorsFormProps) => {
  const { moveBack } = useClusterWizardContext();
  const { values, setFieldValue, submitForm, isValid, errors, touched } =
    useFormikContext<DisconnectedOperatorsValues>();
  const { catalog, operators, totalCount, isLoading, isSearching, error, setSearch } =
    useOlmCatalog(openshiftVersion);

  const selectedPackageNames = React.useMemo(
    () => new Set(values.selectedOperators.map((entry) => entry.packageName)),
    [values.selectedOperators],
  );

  /**
   * Accumulates catalog metadata for every operator we have seen, not just the current page of
   * search results. Without this, an operator's channel dropdown would degrade to plain text as
   * soon as the user searched for something else.
   */
  const seenOperatorsRef = React.useRef<Record<string, OlmCatalogOperator>>({});
  const operatorsByPackageName = React.useMemo(() => {
    operators.forEach((operator) => {
      seenOperatorsRef.current[operator.packageName] = operator;
    });
    return { ...seenOperatorsRef.current };
  }, [operators]);

  const updateSelection = (next: DisconnectedOperatorSelection[]) =>
    void setFieldValue('selectedOperators', next);

  return (
    <ClusterWizardStep
      navigation={<ClusterWizardNavigation />}
      footer={
        <ClusterWizardFooter
          onNext={() => void submitForm()}
          onBack={moveBack}
          isSubmitting={isSubmitting}
          // Deliberately not gated on `error`: the catalog is optional, and a user must never be
          // unable to produce an ISO because an operator listing is unavailable.
          isNextDisabled={!isValid || isSubmitting}
          errorFields={getFormikErrorFields(errors, touched)}
        />
      }
    >
      <WithErrorBoundary title="Failed to load Operators step">
        <Grid hasGutter>
          <GridItem>
            <Content component="h2">Operators</Content>
          </GridItem>
          <GridItem>
            <Content component="p">
              Choose which operators are included in the ISO. Only operators included here can be
              installed once the cluster is running in a disconnected environment.
            </Content>
          </GridItem>
          <GridItem>
            {isLoading ? (
              <LoadingState />
            ) : (
              <Stack hasGutter>
                {error && (
                  <StackItem>
                    <Alert
                      isInline
                      variant={AlertVariant.warning}
                      title="Operator catalog unavailable"
                    >
                      The operator catalog could not be loaded, so additional operators cannot be
                      added right now. The ISO will be built with the default operator set.
                    </Alert>
                  </StackItem>
                )}
                {values.selectedOperators.length > MANY_OPERATORS_WARNING_THRESHOLD && (
                  <StackItem>
                    <Alert
                      isInline
                      variant={AlertVariant.warning}
                      title={`${values.selectedOperators.length} operators selected`}
                    >
                      Each operator increases the size of the ISO and the time it takes to build.
                    </Alert>
                  </StackItem>
                )}
                <StackItem>
                  <Form id="wizard-disconnected-operators__form">
                    <DefaultOperatorSetField />
                    {catalog && !error && (
                      <OperatorCatalogSelect
                        operators={operators}
                        totalCount={totalCount}
                        isSearching={isSearching}
                        isDisabled={isSubmitting}
                        selectedPackageNames={selectedPackageNames}
                        onSearchChange={setSearch}
                        onSelect={(operator) =>
                          updateSelection(
                            addOperator(values.selectedOperators, operator, catalog.id),
                          )
                        }
                      />
                    )}
                  </Form>
                </StackItem>
                <StackItem>
                  <SelectedOperatorsTable
                    selection={values.selectedOperators}
                    operatorsByPackageName={operatorsByPackageName}
                    isDisabled={isSubmitting}
                    onChannelChange={(packageName, channel) =>
                      updateSelection(
                        setOperatorChannel(values.selectedOperators, packageName, channel),
                      )
                    }
                    onRemove={(packageName) =>
                      updateSelection(removeOperator(values.selectedOperators, packageName))
                    }
                  />
                </StackItem>
              </Stack>
            )}
          </GridItem>
        </Grid>
      </WithErrorBoundary>
    </ClusterWizardStep>
  );
};

export const DisconnectedOperatorsStep = () => {
  const { moveNext, disconnectedInfraEnv, setDisconnectedInfraEnv } = useClusterWizardContext();
  const { addAlert, clearAlerts } = useAlerts();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const initialValues: DisconnectedOperatorsValues = React.useMemo(() => {
    const { includeDefaultOperators, olmOperators } =
      OlmCatalogService.readSelection(disconnectedInfraEnv);
    return {
      includeDefaultOperators,
      selectedOperators: toFormikSelection(olmOperators),
    };
  }, [disconnectedInfraEnv]);

  const handleNext = React.useCallback(
    async (values: DisconnectedOperatorsValues) => {
      clearAlerts();

      // Nothing changed: skip the PATCH so navigation is free and an older assisted-service never
      // sees the unknown fields.
      if (!hasSelectionChanged(initialValues, values)) {
        moveNext();
        return;
      }

      setIsSubmitting(true);
      try {
        if (!disconnectedInfraEnv?.id) {
          throw new Error('No disconnected infraEnv available');
        }

        const updatedInfraEnv = await OlmCatalogService.saveSelection(disconnectedInfraEnv.id, {
          includeDefaultOperators: values.includeDefaultOperators,
          olmOperators: toInfraEnvOperators(values.selectedOperators),
        });

        setDisconnectedInfraEnv(updatedInfraEnv);
        moveNext();
      } catch (error) {
        handleApiError(error, () => {
          addAlert({
            title: 'Failed to save operator selection',
            message: getApiErrorMessage(error),
            variant: AlertVariant.danger,
          });
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [clearAlerts, initialValues, disconnectedInfraEnv, setDisconnectedInfraEnv, addAlert, moveNext],
  );

  return (
    <Formik<DisconnectedOperatorsValues>
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={(values) => void handleNext(values)}
    >
      <DisconnectedOperatorsForm
        isSubmitting={isSubmitting}
        openshiftVersion={disconnectedInfraEnv?.openshiftVersion}
      />
    </Formik>
  );
};

export default DisconnectedOperatorsStep;
