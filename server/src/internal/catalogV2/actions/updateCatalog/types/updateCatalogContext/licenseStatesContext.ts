export type LicenseStatesContext = {
	referencedPlanLicenseIds: Set<string>;
};

export const emptyLicenseStatesContext = (): LicenseStatesContext => ({
	referencedPlanLicenseIds: new Set(),
});
