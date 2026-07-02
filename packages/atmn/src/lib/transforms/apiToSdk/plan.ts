import type { Plan as BasePlan } from "../../../compose/models/planModels.js";
import type {
	CustomizePlan,
	Plan,
	PlanItemFilter,
	Variant,
} from "../../../compose/models/variantModels.js";
import type { ApiPlan } from "../../api/types/index.js";
import { transformApiPlanItem } from "./planItem.js";
import { createTransformer } from "./Transformer.js";

/**
 * Declarative plan transformer - replaces 57 lines with ~20 lines of config
 */
export const planTransformer = createTransformer<ApiPlan, BasePlan>({
	copy: ["id", "name", "description", "group", "archived"],

	// Rename snake_case API fields → camelCase SDK fields
	rename: {
		add_on: "addOn",
		auto_enable: "autoEnable",
	},

	// Swap null to undefined for these fields (API → SDK direction)
	// When pulling from API: null becomes undefined (cleaner, won't show in generated code)
	swapNullish: ["group"],

	// Swap false to undefined for these fields (API → SDK direction)
	// When pulling from API: false becomes undefined (only true or undefined in SDK for booleans)
	swapFalse: ["auto_enable", "add_on"],

	// Copy nested price object as-is
	compute: {
		price: (api) =>
			api.price
				? {
						amount: api.price.amount,
						interval: api.price.interval,
						...(api.price.additional_currencies?.length
							? { additionalCurrencies: api.price.additional_currencies }
							: {}),
					}
				: undefined,

		// Transform items array (only if non-empty)
		items: (api) =>
			api.items && api.items.length > 0
				? api.items.map(transformApiPlanItem)
				: undefined,

		// Map snake_case inner fields to camelCase
		freeTrial: (api) =>
			api.free_trial
				? {
						durationLength: api.free_trial.duration_length,
						durationType: api.free_trial.duration_type,
						cardRequired: api.free_trial.card_required,
					}
				: undefined,
	},
});

export function transformApiPlan(
	apiPlan: ApiPlan,
	options: { includeVersion?: boolean } = {},
): Plan {
	const plan = planTransformer.transform(apiPlan);
	return options.includeVersion ? { ...plan, version: apiPlan.version } : plan;
}

type ApiCustomizePlan = NonNullable<
	NonNullable<ApiPlan["variant_details"]>["customize"]
> & {
	items?: ApiPlan["items"];
};
type ApiPlanItemInput = Parameters<typeof transformApiPlanItem>[0];

const transformApiCompatiblePlanItem = (
	item: ApiPlanItemInput | NonNullable<ApiCustomizePlan["add_items"]>[number],
) => transformApiPlanItem(item as ApiPlanItemInput);

const transformApiPlanItemFilter = (
	filter: NonNullable<ApiCustomizePlan["remove_items"]>[number],
): PlanItemFilter => ({
	...(filter.feature_id !== undefined ? { featureId: filter.feature_id } : {}),
	...(filter.billing_method !== undefined
		? { billingMethod: filter.billing_method }
		: {}),
	...(filter.interval !== undefined ? { interval: filter.interval } : {}),
	...(filter.interval_count !== undefined
		? { intervalCount: filter.interval_count }
		: {}),
});

const transformApiCustomizePlan = (
	customize: ApiCustomizePlan | undefined,
): CustomizePlan | undefined => {
	if (!customize) return undefined;

	const result: CustomizePlan = {
		...(customize.price !== undefined
			? {
					price: customize.price
						? {
								amount: customize.price.amount,
								interval: customize.price.interval,
								...(customize.price.interval_count !== undefined
									? { intervalCount: customize.price.interval_count }
									: {}),
								...(customize.price.additional_currencies?.length
									? {
											additionalCurrencies:
												customize.price.additional_currencies,
										}
									: {}),
							}
						: null,
				}
			: {}),
		...(customize.items !== undefined
			? { items: customize.items.map(transformApiCompatiblePlanItem) }
			: {}),
		...(customize.add_items !== undefined
			? { addItems: customize.add_items.map(transformApiCompatiblePlanItem) }
			: {}),
		...(customize.remove_items !== undefined
			? { removeItems: customize.remove_items.map(transformApiPlanItemFilter) }
			: {}),
		...(customize.free_trial !== undefined
			? {
					freeTrial: customize.free_trial
						? {
								durationLength: customize.free_trial.duration_length,
								durationType: customize.free_trial.duration_type,
								cardRequired: customize.free_trial.card_required,
							}
						: null,
				}
			: {}),
		...(customize.billing_controls !== undefined
			? { billingControls: customize.billing_controls }
			: {}),
	};

	return Object.keys(result).length > 0 ? result : undefined;
};

const transformApiPlanVariant = (
	apiPlan: ApiPlan,
	options: { includeVersion?: boolean } = {},
): Variant => {
	const customize = transformApiCustomizePlan(
		apiPlan.variant_details?.customize,
	);

	return {
		id: apiPlan.id,
		name: apiPlan.name,
		...(options.includeVersion ? { version: apiPlan.version } : {}),
		...(customize ? { customize } : {}),
	};
};

const sortByIdVersion = (a: ApiPlan, b: ApiPlan) =>
	a.id.localeCompare(b.id) || a.version - b.version;

export function transformApiPlans(
	apiPlans: ApiPlan[],
	options: { allVersions?: boolean } = {},
): Plan[] {
	const { allVersions = false } = options;
	const planById = new Map(apiPlans.map((apiPlan) => [apiPlan.id, apiPlan]));
	const variantsByBaseId = new Map<string, Variant[]>();
	const basePlanIds = new Set<string>();
	const basePlans = apiPlans.filter((apiPlan) => !apiPlan.variant_details);
	const latestBaseVersionById = new Map<string, number>();

	for (const apiPlan of basePlans) {
		const latestVersion = latestBaseVersionById.get(apiPlan.id) ?? 0;
		if (apiPlan.version > latestVersion) {
			latestBaseVersionById.set(apiPlan.id, apiPlan.version);
		}
	}

	for (const apiPlan of apiPlans) {
		const basePlanId = apiPlan.variant_details?.base_plan_id;
		if (!basePlanId || !planById.has(basePlanId)) continue;

		basePlanIds.add(apiPlan.id);
		const variants = variantsByBaseId.get(basePlanId) ?? [];
		variants.push(
			transformApiPlanVariant(apiPlan, { includeVersion: allVersions }),
		);
		variantsByBaseId.set(basePlanId, variants);
	}

	const transformed = apiPlans
		.filter((apiPlan) => !basePlanIds.has(apiPlan.id))
		.sort(allVersions ? sortByIdVersion : () => 0)
		.map((apiPlan) => {
			const plan = transformApiPlan(apiPlan, {
				includeVersion: allVersions,
			}) as Plan;
			const isLatestBase =
				!allVersions ||
				apiPlan.version === latestBaseVersionById.get(apiPlan.id);
			const variants = isLatestBase
				? variantsByBaseId.get(apiPlan.id)?.sort((a, b) => {
						const byId = a.id.localeCompare(b.id);
						if (byId !== 0) return byId;
						return (a.version ?? 0) - (b.version ?? 0);
					})
				: undefined;
			return variants && variants.length > 0 ? { ...plan, variants } : plan;
		});

	return transformed;
}
