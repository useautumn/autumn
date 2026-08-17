import type {
	CustomizePlanLicense,
	FullPlanLicense,
	PlanLicenseParams,
	RemovePlanLicense,
} from "@autumn/shared";
import { fullPlanLicenseToCustomize } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/fullPlanLicenseToCustomize";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertProductPlanToLicenses } from "../licensePlanUtils";

const currentLinkToParams = ({
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

/** Current links + upsert/remove. Remove first; upsert can add the id back. */
const applyLicensePatch = ({
	currentLicenses,
	upsertLicenses,
	removeLicenses,
}: {
	currentLicenses: FullPlanLicense[];
	upsertLicenses: CustomizePlanLicense[];
	removeLicenses: RemovePlanLicense[];
}): PlanLicenseParams[] => {
	const removed = new Set(
		removeLicenses.map((entry) => entry.license_plan_id),
	);
	const byPlanId = new Map(
		currentLicenses
			.filter((link) => !removed.has(link.product.id))
			.map((link) => [link.product.id, currentLinkToParams({ link })]),
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

/** licenses[] as-is, or current links + upsert/remove patch. */
export const computeFinalDeclaredLicenses = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): PlanLicenseParams[] | undefined => {
	if (upsert.declaredLicenses !== undefined) return upsert.declaredLicenses;
	if (
		upsert.upsertLicenses === undefined &&
		upsert.removeLicenses === undefined
	) {
		return undefined;
	}

	return applyLicensePatch({
		currentLicenses: upsertProductPlanToLicenses({ upsert }),
		upsertLicenses: upsert.upsertLicenses ?? [],
		removeLicenses: upsert.removeLicenses ?? [],
	});
};
