import type { PlanChangeCustomizeV0 } from "@autumn/shared";

export const mergePlanChangeCustomize = ({
	coreCustomize,
	upsertLicenses,
	removeLicenses,
}: {
	coreCustomize?: PlanChangeCustomizeV0;
	upsertLicenses: PlanChangeCustomizeV0["upsert_licenses"];
	removeLicenses: PlanChangeCustomizeV0["remove_licenses"];
}): PlanChangeCustomizeV0 | undefined => {
	const customize: PlanChangeCustomizeV0 = {
		...coreCustomize,
		...(upsertLicenses && upsertLicenses.length > 0
			? { upsert_licenses: upsertLicenses }
			: {}),
		...(removeLicenses && removeLicenses.length > 0
			? { remove_licenses: removeLicenses }
			: {}),
	};

	return Object.keys(customize).length > 0 ? customize : undefined;
};
