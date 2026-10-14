import type {
	ApiPlanV1,
	Feature,
	FullProduct,
	PlanChangeV0,
} from "@autumn/shared";
import { buildPlanChangeCore } from "./buildPlanChangeCore/buildPlanChangeCore.js";
import { buildPlanLicenseChanges } from "./buildPlanLicenseChanges/buildPlanLicenseChanges.js";
import { fullProductToApiPlanV1Sync } from "./fullProductToApiPlanV1Sync.js";
import { mergePlanChangeCustomize } from "./mergePlanChangeCustomize.js";

const emptyPlanBefore = (to: ApiPlanV1): ApiPlanV1 =>
	({
		id: to.id,
		version: to.version,
		version_slug: to.version_slug,
		active: to.active,
		created_at: to.created_at,
		env: to.env,
		archived: false,
		add_on: false,
		auto_enable: false,
		config: to.config,
		metadata: {},
		items: [],
	}) as unknown as ApiPlanV1;

export const buildPlanChange = ({
	from,
	to,
	features,
}: {
	from?: FullProduct;
	to?: FullProduct;
	features?: Feature[];
}): PlanChangeV0 | undefined => {
	if (!to) return undefined;

	const toPlan = fullProductToApiPlanV1Sync({ product: to, features });
	const core = buildPlanChangeCore({
		from: from
			? fullProductToApiPlanV1Sync({ product: from, features })
			: emptyPlanBefore(toPlan),
		to: toPlan,
	});
	const { licenseChanges, upsertLicenses, removeLicenses } =
		buildPlanLicenseChanges({
			fromLicenses: from?.licenses ?? [],
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
