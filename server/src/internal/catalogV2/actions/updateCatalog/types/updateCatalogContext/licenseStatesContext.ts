/** License link state loaded at setup. */
export type LicenseStatesContext = {
	/** Links a customer_license still points at — their definitions are immutable. */
	referencedPlanLicenseIds: Set<string>;
};

export const emptyLicenseStatesContext = (): LicenseStatesContext => ({
	referencedPlanLicenseIds: new Set(),
});
