import type {
	CustomizePlanLicense,
	FullPlanLicense,
	PlanLicenseParams,
	RemovePlanLicense,
} from "@autumn/shared";
import { fullPlanLicenseToCustomize } from "./fullPlanLicenseToCustomize";

export const fullPlanLicenseToParams = ({
	link,
}: {
	link: FullPlanLicense;
}): PlanLicenseParams => {
	const customize = fullPlanLicenseToCustomize({ license: link });
	return {
		license_plan_id: link.product.id,
		included: link.included,
		prepaid_only: link.prepaid_only,
		...(customize !== undefined ? { customize } : {}),
		...(link.metadata != null ? { metadata: link.metadata } : {}),
	};
};

/** Remove first; upsert can add the id back. */
export const applyLicenseParamsPatch = ({
	licenses,
	upsertLicenses = [],
	removeLicenses = [],
}: {
	licenses: PlanLicenseParams[];
	upsertLicenses?: CustomizePlanLicense[];
	removeLicenses?: RemovePlanLicense[];
}): PlanLicenseParams[] => {
	const removed = new Set(
		removeLicenses.map((entry) => entry.license_plan_id),
	);
	const byPlanId = new Map(
		licenses
			.filter((license) => !removed.has(license.license_plan_id))
			.map((license) => [license.license_plan_id, license]),
	);

	for (const upsert of upsertLicenses) {
		const current = byPlanId.get(upsert.license_plan_id);
		byPlanId.set(upsert.license_plan_id, {
			license_plan_id: upsert.license_plan_id,
			included: upsert.included ?? current?.included ?? 0,
			prepaid_only: upsert.prepaid_only ?? current?.prepaid_only ?? true,
			...(upsert.customize !== undefined
				? { customize: upsert.customize }
				: current?.customize !== undefined
					? { customize: current.customize }
					: {}),
			...(upsert.metadata !== undefined
				? { metadata: upsert.metadata }
				: current?.metadata !== undefined
					? { metadata: current.metadata }
					: {}),
		});
	}

	return [...byPlanId.values()];
};
