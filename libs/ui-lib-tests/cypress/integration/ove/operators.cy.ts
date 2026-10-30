import { disconnectedOperatorsPage } from '../../views/disconnectedOperators';

/**
 * Coverage for the OVE above-the-sea Operators step.
 *
 * NOTE: this spec has never been executed — the assisted-service endpoints it relies on do not
 * exist yet, and it additionally requires the `ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE` flag to be
 * on. Treat it as an executable statement of intent, not as passing coverage, and expect to adjust
 * the navigation helpers the first time it is run.
 *
 * The contract it asserts against lives in `docs/api-design/ove-olm-operator-selection.md`; the
 * fixtures and intercepts are in `cypress/fixtures/olm-catalogs` and `cypress/support/interceptors`.
 */
describe('OVE above-the-sea operator selection', () => {
  beforeEach(() => {
    cy.setTestEnvironment({
      activeSignal: '',
      activeScenario: 'AI_CREATE_MULTINODE',
    });
    // TODO: navigate through the disconnected wizard to the Operators step. There is no existing
    // page object for the above-the-sea flow; it needs the "I'm installing on a
    // disconnected/air-gapped/secured environment" switch on Cluster details, then Basic
    // information and Optional configurations.
  });

  it('includes the default operator set by default', () => {
    disconnectedOperatorsPage.getDefaultOperatorSetCheckbox().should('be.checked');
  });

  it('clears the default operator set', () => {
    disconnectedOperatorsPage.getDefaultOperatorSetCheckbox().uncheck();
    cy.get('button').contains('Next').click();

    cy.wait('@update-infra-env').then(({ request }) => {
      expect(request.body).to.have.property('include_default_operators', false);
    });
  });

  it('adds an operator with its default channel preselected', () => {
    disconnectedOperatorsPage.searchForOperator('metallb');
    disconnectedOperatorsPage.selectOperatorFromMenu('MetalLB Operator');

    disconnectedOperatorsPage.getSelectedOperatorRow('metallb-operator').should('exist');
    disconnectedOperatorsPage
      .getChannelToggle('metallb-operator')
      .should('contain.text', 'stable (default)');
  });

  it('persists a channel change', () => {
    disconnectedOperatorsPage.searchForOperator('metallb');
    disconnectedOperatorsPage.selectOperatorFromMenu('MetalLB Operator');
    disconnectedOperatorsPage.selectChannel('metallb-operator', 'candidate');

    cy.get('button').contains('Next').click();

    cy.wait('@update-infra-env').then(({ request }) => {
      expect(request.body.olm_operators).to.deep.include({
        package_name: 'metallb-operator',
        channel: 'candidate',
        catalog: 'redhat-operators',
      });
    });
  });

  it('removes a selected operator', () => {
    disconnectedOperatorsPage.searchForOperator('metallb');
    disconnectedOperatorsPage.selectOperatorFromMenu('MetalLB Operator');
    disconnectedOperatorsPage.removeOperator('metallb-operator');
    disconnectedOperatorsPage.getSelectedOperatorRow('metallb-operator').should('not.exist');
  });

  it('truncates the menu and tells the user to refine the search', () => {
    disconnectedOperatorsPage.searchForOperator('example');
    cy.get('#operator-catalog-select-listbox').should('contain.text', 'refine your search');
  });

  it('stays usable when the catalog has not been synced yet', () => {
    cy.intercept('GET', '/api/assisted-install/v2/olm-catalogs?*', {
      statusCode: 503,
      headers: { 'Retry-After': '30' },
      body: { reason: 'Catalog index is still being extracted' },
    }).as('olm-catalogs-unavailable');

    cy.reload();

    disconnectedOperatorsPage.getCatalogUnavailableAlert().should('be.visible');
    // The catalog is optional: a user must never be blocked from producing an ISO.
    cy.get('button').contains('Next').should('be.enabled');
  });
});
