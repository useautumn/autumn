import type { CustomizePlanV1 } from "@api/billing/common/customizePlan/customizePlanV1";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { ApiPlanItemV1 } from "@api/products/items/apiPlanItemV1.js";
import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter";
import { AppEnv } from "@models/genModels/genEnums.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";

type PlanPrice = NonNullable<ApiPlanV1["price"]>;
type EvalCustomizePlan = Omit<
	CustomizePlanV1,
	"add_items" | "items" | "price"
> & {
	add_items?: ApiPlanV1["items"];
	items?: ApiPlanV1["items"];
	price?: CustomizePlanV1["price"] | PlanPrice | null;
};

const dollarsToCents = (amount: number) => amount * 100;
const displayAmount = (amount: number) => `$${amount}`;

const planNameFromId = (planId: string) =>
	planId
		.split(/[-_]/)
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");

const itemMatchesFilter = ({
	filter,
	item,
}: {
	filter: PlanItemFilter;
	item: ApiPlanItemV1;
}) => {
	if (filter.feature_id !== undefined && item.feature_id !== filter.feature_id)
		return false;
	if (
		filter.billing_method !== undefined &&
		item.price?.billing_method !== filter.billing_method
	)
		return false;
	if (filter.interval !== undefined) {
		const itemInterval = item.price?.interval ?? item.reset?.interval;
		if (String(itemInterval) !== String(filter.interval)) return false;
	}
	return true;
};

const assertNoDuplicateItems = (items: ApiPlanV1["items"]) => {
	const featureIds = items.map((item) => item.feature_id);
	const duplicateFeatureId = featureIds.find(
		(featureId, index) => featureIds.indexOf(featureId) !== index,
	);
	if (!duplicateFeatureId) return;

	throw new Error(
		`Customized plan has duplicate item for feature ${duplicateFeatureId}; remove or update the original item first.`,
	);
};

const applyCustomizeItems = ({
	customize,
	items,
}: {
	customize: EvalCustomizePlan;
	items: ApiPlanV1["items"];
}) => {
	if (
		customize.items !== undefined &&
		(customize.add_items !== undefined ||
			customize.remove_items !== undefined ||
			customize.update_items !== undefined)
	) {
		throw new Error(
			"customize.items cannot be combined with add_items, remove_items, or update_items.",
		);
	}

	const nextItems = customize.items ?? [
		...items
			.filter(
				(item) =>
					!(customize.remove_items ?? []).some((filter) =>
						itemMatchesFilter({ filter, item }),
					),
			)
			.map((item) => {
				const update = (customize.update_items ?? []).find((update) =>
					itemMatchesFilter({ filter: update.filter, item }),
				);
				return update?.included !== undefined
					? { ...item, included: update.included }
					: item;
			}),
		...(customize.add_items ?? []),
	];
	assertNoDuplicateItems(nextItems);
	return nextItems;
};

/** Base price amounts are in dollars; returned API price.amount is cents. */
export const basePrice = {
	annual: ({ amount = 200 } = {}): PlanPrice => ({
		amount: dollarsToCents(amount),
		display: {
			primary_text: displayAmount(amount),
			secondary_text: "per year",
		},
		interval: BillingInterval.Year,
	}),
	monthly: ({ amount = 20 } = {}): PlanPrice => ({
		amount: dollarsToCents(amount),
		display: {
			primary_text: displayAmount(amount),
			secondary_text: "per month",
		},
		interval: BillingInterval.Month,
	}),
};

const createPlan = ({
	addOn = false,
	basePrice,
	items = [],
	name,
	planId,
	version = 1,
}: {
	addOn?: boolean;
	basePrice: PlanPrice | null;
	items?: ApiPlanV1["items"];
	name?: string;
	planId: string;
	version?: number;
}): ApiPlanV1 => ({
	add_on: addOn,
	archived: false,
	auto_enable: false,
	base_variant_id: null,
	config: { ignore_past_due: false },
	created_at: 1_767_225_600_000,
	description: null,
	env: AppEnv.Sandbox,
	group: null,
	id: planId,
	items,
	name: name ?? planNameFromId(planId),
	price: basePrice,
	version,
});

/** Plan fixtures default to realistic base prices and accept plan items directly. */
export const plan = {
	addOn: ({
		basePrice: price = null,
		planId,
		...args
	}: {
		basePrice?: PlanPrice | null;
		items?: ApiPlanV1["items"];
		name?: string;
		planId: string;
		version?: number;
	}): ApiPlanV1 =>
		createPlan({ ...args, addOn: true, basePrice: price, planId }),
	annual: ({
		basePrice: price = basePrice.annual(),
		planId = "enterprise",
		...args
	}: {
		basePrice?: PlanPrice | null;
		items?: ApiPlanV1["items"];
		name?: string;
		planId?: string;
		version?: number;
	} = {}): ApiPlanV1 => createPlan({ ...args, basePrice: price, planId }),
	monthly: ({
		basePrice: price = basePrice.monthly(),
		planId = "pro",
		...args
	}: {
		basePrice?: PlanPrice | null;
		items?: ApiPlanV1["items"];
		name?: string;
		planId?: string;
		version?: number;
	} = {}): ApiPlanV1 => createPlan({ ...args, basePrice: price, planId }),
	customized: ({
		customize,
		name,
		plan: basePlan,
		planId = `${basePlan.id}_custom`,
		version = basePlan.version,
	}: {
		customize: EvalCustomizePlan;
		name?: string;
		plan: ApiPlanV1;
		planId?: string;
		version?: number;
	}): ApiPlanV1 => ({
		...basePlan,
		base_variant_id: basePlan.base_variant_id ?? basePlan.id,
		id: planId,
		items: applyCustomizeItems({
			customize,
			items: basePlan.items,
		}),
		name: name ?? basePlan.name,
		price:
			customize.price === undefined
				? basePlan.price
				: (customize.price as PlanPrice | null),
		version,
		...(customize.free_trial !== undefined
			? { free_trial: customize.free_trial ?? undefined }
			: {}),
	}),
};
