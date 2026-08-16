import type { Feature, FullProduct, PlanChangeV0 } from "@autumn/shared";
import { buildPlanChangeCore } from "./buildPlanChangeCore/buildPlanChangeCore.js";
import { buildPlanLicenseChanges } from "./buildPlanLicenseChanges/buildPlanLicenseChanges.js";
import { fullProductToApiPlanV1Sync } from "./fullProductToApiPlanV1Sync.js";
import { mergePlanChangeCustomize } from "./mergePlanChangeCustomize.js";

/**
 * Diff two FullProducts: core content (via ApiPlanV1) plus licenses[]
 * (create / update / remove). Undefined when nothing changed.
 */
export const buildPlanChange = ({
	from,
	to,
	features,
}: {
	from?: FullProduct;
	to?: FullProduct;
	features?: Feature[];
}): PlanChangeV0 | undefined => {
	if (!from || !to) return undefined;

	const core = buildPlanChangeCore({
		from: fullProductToApiPlanV1Sync({ product: from, features }),
		to: fullProductToApiPlanV1Sync({ product: to, features }),
	});
	const { licenseChanges, upsertLicenses, removeLicenses } =
		buildPlanLicenseChanges({
			fromLicenses: from.licenses,
			toLicenses: to.licenses,
			features,
		});

	if (!core && licenseChanges.length === 0) return undefined;

	const customize = mergePlanChangeCustomize({
		coreCustomize: core?.customize,
		upsertLicenses,
		removeLicenses,
	});

	return {
		previous_attributes: core?.previous_attributes ?? null,
		item_changes: core?.item_changes ?? [],
		...(core?.price_change !== undefined
			? { price_change: core.price_change }
			: {}),
		...(core?.free_trial_change !== undefined
			? { free_trial_change: core.free_trial_change }
			: {}),
		...(core?.plan !== undefined ? { plan: core.plan } : {}),
		...(licenseChanges.length > 0 ? { license_changes: licenseChanges } : {}),
		...(customize !== undefined ? { customize } : {}),
	};
};
