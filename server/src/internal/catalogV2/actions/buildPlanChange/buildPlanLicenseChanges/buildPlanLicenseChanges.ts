import type {
	CustomizePlanLicense,
	Feature,
	FullPlanLicense,
	PlanLicenseChangeV0,
	RemovePlanLicense,
} from "@autumn/shared";
import { buildLicenseEffectivePlanChange } from "./buildLicenseEffectivePlanChange.js";
import { buildPlanLicensePreviousAttributes } from "./buildPlanLicensePreviousAttributes.js";
import { planLicenseChanged } from "./planLicenseChanged.js";
import { toApiPlanLicenseSnapshot } from "./toApiPlanLicenseSnapshot.js";
import { toCustomizePlanLicense } from "./toCustomizePlanLicense.js";

/** Re-key a from-link whose license row was renamed, so it pairs with its to-link by internal id. */
const pairRenamedLicenses = ({
	fromByPlanId,
	toByPlanId,
}: {
	fromByPlanId: Map<string, FullPlanLicense>;
	toByPlanId: Map<string, FullPlanLicense>;
}): Map<string, FullPlanLicense> => {
	const renamedToPlanIdByInternalId = new Map(
		[...toByPlanId]
			.filter(([planId]) => !fromByPlanId.has(planId))
			.map(([planId, to]) => [to.license_internal_product_id, planId]),
	);
	return new Map(
		[...fromByPlanId].map(([planId, from]) => {
			if (toByPlanId.has(planId)) return [planId, from];
			const renamedPlanId = renamedToPlanIdByInternalId.get(
				from.license_internal_product_id,
			);
			return [renamedPlanId ?? planId, from];
		}),
	);
};

/** Diff two FullProduct.licenses arrays — create / update / remove. */
export const buildPlanLicenseChanges = ({
	fromLicenses,
	toLicenses,
	features,
}: {
	fromLicenses?: FullPlanLicense[];
	toLicenses?: FullPlanLicense[];
	features?: Feature[];
}): {
	licenseChanges: PlanLicenseChangeV0[];
	upsertLicenses: CustomizePlanLicense[];
	removeLicenses: RemovePlanLicense[];
} => {
	const fromByPlanId = new Map(
		(fromLicenses ?? []).map((license) => [license.product.id, license]),
	);
	const toByPlanId = new Map(
		(toLicenses ?? []).map((license) => [license.product.id, license]),
	);
	const fromByPlanIdAfterRenames = pairRenamedLicenses({
		fromByPlanId,
		toByPlanId,
	});

	const licenseChanges: PlanLicenseChangeV0[] = [];
	const upsertLicenses: CustomizePlanLicense[] = [];
	const removeLicenses: RemovePlanLicense[] = [];

	for (const [licensePlanId, to] of toByPlanId) {
		const from = fromByPlanIdAfterRenames.get(licensePlanId);
		if (!from) {
			const snapshot = toApiPlanLicenseSnapshot({ license: to, features });
			licenseChanges.push({
				...snapshot,
				action: "created",
				previous_attributes: null,
			});
			upsertLicenses.push(
				toCustomizePlanLicense({ snapshot, metadata: to.metadata }),
			);
			continue;
		}

		if (!planLicenseChanged({ from, to, features })) continue;

		const snapshot = toApiPlanLicenseSnapshot({ license: to, features });
		licenseChanges.push({
			...snapshot,
			action: "updated",
			previous_attributes: buildPlanLicensePreviousAttributes({ from, to }),
			plan_change: buildLicenseEffectivePlanChange({ from, to, features }),
		});
		upsertLicenses.push(
			toCustomizePlanLicense({ snapshot, metadata: to.metadata }),
		);
	}

	for (const [licensePlanId, from] of fromByPlanIdAfterRenames) {
		if (toByPlanId.has(licensePlanId)) continue;
		const snapshot = toApiPlanLicenseSnapshot({ license: from, features });
		licenseChanges.push({
			...snapshot,
			action: "removed",
			previous_attributes: null,
		});
		removeLicenses.push({ license_plan_id: snapshot.license_plan_id });
	}

	return { licenseChanges, upsertLicenses, removeLicenses };
};
