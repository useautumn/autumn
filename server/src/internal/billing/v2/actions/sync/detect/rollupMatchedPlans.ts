import {
	BillingInterval,
	type CustomizePlanV1,
	type FullProduct,
	isFixedPrice,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import type {
	ItemDiff,
	MatchedPlan,
	PlanBase,
	PlanExtra,
	PlanFeature,
	PlanWarning,
} from "./types";

type CustomBasePrice = NonNullable<CustomizePlanV1["price"]>;

const STRIPE_TO_AUTUMN_INTERVAL: Record<string, BillingInterval> = {
	week: BillingInterval.Week,
	month: BillingInterval.Month,
	year: BillingInterval.Year,
};

const stripeItemToBasePrice = ({
	item,
}: {
	item: StripeItemSnapshot;
}): CustomBasePrice | null => {
	if (item.unit_amount === null) return null;
	if (!item.recurring_interval) return null;
	const interval = STRIPE_TO_AUTUMN_INTERVAL[item.recurring_interval];
	if (!interval) return null;
	return {
		amount: stripeToAtmnAmount({
			amount: item.unit_amount,
			currency: item.currency ?? "usd",
		}),
		interval,
		stripe_price_id: item.stripe_price_id,
	};
};

const productFromDiff = ({ diff }: { diff: ItemDiff }): FullProduct | null => {
	if (diff.match.kind === "none") return null;
	return diff.match.product;
};

const groupByProduct = ({
	itemDiffs,
}: {
	itemDiffs: ItemDiff[];
}): Map<string, { product: FullProduct; diffs: ItemDiff[] }> => {
	const byInternalId = new Map<
		string,
		{ product: FullProduct; diffs: ItemDiff[] }
	>();
	for (const diff of itemDiffs) {
		const product = productFromDiff({ diff });
		if (!product) continue;
		const existing = byInternalId.get(product.internal_id) ?? {
			product,
			diffs: [],
		};
		existing.diffs.push(diff);
		byInternalId.set(product.internal_id, existing);
	}
	return byInternalId;
};

const partitionDiffs = ({
	diffs,
	autumnBasePriceId,
}: {
	diffs: ItemDiff[];
	autumnBasePriceId: string | null;
}) => {
	const matchedBase: ItemDiff[] = [];
	const customBase: ItemDiff[] = [];
	const features: ItemDiff[] = [];
	for (const diff of diffs) {
		const m = diff.match;
		if (m.kind === "autumn_price") {
			if (autumnBasePriceId && m.price.id === autumnBasePriceId) {
				matchedBase.push(diff);
			} else {
				features.push(diff);
			}
		} else if (m.kind === "autumn_product") {
			customBase.push(diff);
		}
	}
	return { matchedBase, customBase, features };
};

type BaseDecision = {
	base: PlanBase;
	customize?: CustomizePlanV1;
	consumedCustomBase: ItemDiff | null;
	warnings: PlanWarning[];
};

const decideBase = ({
	matchedBase,
	customBase,
	autumnBasePrice,
}: {
	matchedBase: ItemDiff[];
	customBase: ItemDiff[];
	autumnBasePrice: { id: string } | null;
}): BaseDecision => {
	const warnings: PlanWarning[] = [];

	if (matchedBase.length > 0) {
		const [chosen] = matchedBase;
		if (chosen.match.kind !== "autumn_price") {
			throw new Error("matchedBase diff lost its autumn_price match");
		}
		return {
			base: {
				kind: "matched",
				stripe_item_id: chosen.stripe.id,
				autumn_price_id: chosen.match.price.id,
			},
			consumedCustomBase: null,
			warnings,
		};
	}

	if (customBase.length > 0) {
		const [chosen] = customBase;
		const basePrice = stripeItemToBasePrice({ item: chosen.stripe });
		if (!basePrice) {
			return {
				base: autumnBasePrice ? { kind: "dropped" } : { kind: "absent" },
				customize: autumnBasePrice ? { price: null } : undefined,
				consumedCustomBase: null,
				warnings: autumnBasePrice ? [{ type: "base_price_dropped" }] : [],
			};
		}
		return {
			base: { kind: "custom", stripe_item_id: chosen.stripe.id },
			customize: { price: basePrice },
			consumedCustomBase: chosen,
			warnings,
		};
	}

	if (autumnBasePrice) {
		return {
			base: { kind: "dropped" },
			customize: { price: null },
			consumedCustomBase: null,
			warnings: [{ type: "base_price_dropped" }],
		};
	}

	return { base: { kind: "absent" }, consumedCustomBase: null, warnings };
};

const lookupBaseStripeItem = ({
	base,
	diffs,
}: {
	base: PlanBase;
	diffs: ItemDiff[];
}): StripeItemSnapshot | null => {
	if (base.kind === "dropped" || base.kind === "absent") return null;
	const found = diffs.find((d) => d.stripe.id === base.stripe_item_id);
	return found?.stripe ?? null;
};

const isAddOn = ({ product }: { product: FullProduct }): boolean =>
	product.is_add_on === true;

const rollupOnePlan = ({
	product,
	diffs,
}: {
	product: FullProduct;
	diffs: ItemDiff[];
}): MatchedPlan => {
	const autumnBasePrice = product.prices.find(isFixedPrice) ?? null;

	const { matchedBase, customBase, features } = partitionDiffs({
		diffs,
		autumnBasePriceId: autumnBasePrice?.id ?? null,
	});

	const decision = decideBase({
		matchedBase,
		customBase,
		autumnBasePrice,
	});

	const extraDiffs = customBase.filter(
		(d) => d !== decision.consumedCustomBase,
	);

	const planFeatures: PlanFeature[] = features.map((d) => {
		if (d.match.kind !== "autumn_price") {
			throw new Error("feature diff lost its autumn_price match");
		}
		return {
			stripe_item_id: d.stripe.id,
			autumn_price_id: d.match.price.id,
		};
	});

	const planExtras: PlanExtra[] = extraDiffs.map((d) => ({
		stripe_item_id: d.stripe.id,
	}));

	const warnings = [...decision.warnings];
	if (planExtras.length > 0) {
		warnings.push({
			type: "extra_items_under_plan",
			stripe_item_ids: planExtras.map((e) => e.stripe_item_id),
		});
	}

	const baseStripeItem = lookupBaseStripeItem({ base: decision.base, diffs });
	const quantity =
		baseStripeItem?.quantity ?? features[0]?.stripe.quantity ?? 1;

	if (baseStripeItem && quantity > 1 && !isAddOn({ product })) {
		warnings.push({ type: "base_plan_quantity_gt_one", quantity });
	}

	return {
		product,
		quantity,
		base: decision.base,
		features: planFeatures,
		extras: planExtras,
		customize: decision.customize,
		warnings,
	};
};

/**
 * Roll up per-item diffs into per-plan matches. Reads each diff's embedded
 * FullProduct directly — no separate product map required.
 */
export const rollupMatchedPlans = ({
	itemDiffs,
}: {
	itemDiffs: ItemDiff[];
}): MatchedPlan[] => {
	const byProduct = groupByProduct({ itemDiffs });
	const plans: MatchedPlan[] = [];
	for (const { product, diffs } of byProduct.values()) {
		plans.push(rollupOnePlan({ product, diffs }));
	}
	return plans;
};
