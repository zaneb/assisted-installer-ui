export const disconnectedOperatorsPage = {
  getDefaultOperatorSetCheckbox: () => cy.get('input[name="includeDefaultOperators"]'),

  getDefaultOperatorSetSection: () => cy.get('[data-testid="default-operator-set-section"]'),

  getSearchInput: () => cy.get('[data-testid="operator-catalog-search"]'),

  searchForOperator: (term: string) => {
    disconnectedOperatorsPage.getSearchInput().clear().type(term);
    // The typeahead debounces for 300ms before querying.
    cy.wait('@olm-operators');
  },

  selectOperatorFromMenu: (displayName: string) =>
    cy.get('#operator-catalog-select-listbox').contains(displayName).click(),

  getSelectedOperatorsTable: () => cy.get('[data-testid="selected-operators-table"]'),

  getSelectedOperatorRow: (packageName: string) =>
    cy.get(`[data-testid="selected-operator-${packageName}"]`),

  getChannelToggle: (packageName: string) =>
    cy.get(`[data-testid="operator-channel-toggle-${packageName}"]`),

  selectChannel: (packageName: string, channel: string) => {
    disconnectedOperatorsPage.getChannelToggle(packageName).click();
    cy.get(`#operator-channel-${packageName}`).contains(channel).click();
  },

  removeOperator: (packageName: string) =>
    cy.get(`[data-testid="remove-operator-${packageName}"]`).click(),

  getCatalogUnavailableAlert: () => cy.contains('Operator catalog unavailable'),

  getOperatorsSummary: () => cy.get('[data-testid="disconnected-operators-summary"]'),
};
