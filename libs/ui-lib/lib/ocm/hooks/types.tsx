export type AssistedInstallerFeatureType =
  | 'ASSISTED_INSTALLER_SINGLE_CLUSTER_FEATURE'
  // Operator selection for the OVE disconnected ISO. Off until the assisted-service catalog
  // endpoints exist — see docs/api-design/ove-olm-operator-selection.md.
  | 'ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE';

export type FeatureListType = {
  [key in AssistedInstallerFeatureType]?: boolean;
};

export type AssistedInstallerOCMPermissionTypes = 'canEdit';
export type AssistedInstallerOCMPermissionTypesListType = {
  [key in AssistedInstallerOCMPermissionTypes]: boolean;
};
export type AssistedInstallerPermissionTypes = 'isViewerMode';
export type AssistedInstallerPermissionTypesListType = {
  [key in AssistedInstallerPermissionTypes]: boolean;
};

// Hardcoded outside OCM
export const STANDALONE_DEPLOYMENT_ENABLED_FEATURES: FeatureListType = {
  ASSISTED_INSTALLER_SINGLE_CLUSTER_FEATURE: false,
  ASSISTED_INSTALLER_OVE_OPERATORS_FEATURE: false,
};
