import type { CatalogPlanVersioningStrategy } from "@autumn/shared";

/** `existing` / `new_version` / `all_versions` this plan can pick from its own customers and version count. */
export const computeVersioningOptionsForPlan = ({
	hasCustomers,
	isLatestVersion,
	hasMultipleVersions,
}: {
	hasCustomers: boolean;
	isLatestVersion: boolean;
	hasMultipleVersions: boolean;
}): CatalogPlanVersioningStrategy[] => {
	const options: CatalogPlanVersioningStrategy[] = [];
	if (hasCustomers) options.push("existing");
	if (hasCustomers && isLatestVersion) options.push("new_version");
	if (hasMultipleVersions) options.push("all_versions");
	return options;
};
