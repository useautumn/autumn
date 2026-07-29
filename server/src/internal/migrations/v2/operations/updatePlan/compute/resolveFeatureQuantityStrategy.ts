import {
	addCusProductToCusEnt,
	type CreatePlanItemParamsV1,
	cusEntsToAllowance,
	cusEntToPrepaidInvoiceOverage,
	type FeatureQuantityParamsV0,
	type FullCusProduct,
	isPrepaidPrice,
	type MigrationFeatureQuantityStrategyParams,
	priceToLineAmount,
	type UsagePriceConfig,
	type UsageTier,
} from "@autumn/shared";

const isFiniteTier = (tier: UsageTier): tier is UsageTier & { to: number } =>
	typeof tier.to === "number";

/**
 * Resolves the customer's current monthly amount for `featureId` on this
 * cusProduct, using the same pure amount calculator real invoice line items
 * are built from (`usagePriceToLineItem` calls `priceToLineAmount`) — so
 * "current spend" is computed identically to how it'd actually be invoiced.
 */
const resolveCurrentAmount = ({
	featureId,
	customerProduct,
}: {
	featureId: string;
	customerProduct: FullCusProduct;
}): number | undefined => {
	const oldCusPrice = customerProduct.customer_prices.find(
		(cusPrice) =>
			cusPrice.price &&
			isPrepaidPrice(cusPrice.price) &&
			(cusPrice.price.config as UsagePriceConfig).feature_id === featureId,
	);
	if (!oldCusPrice?.price) return undefined;

	const entitlementId = oldCusPrice.price.entitlement_id;
	const oldCusEnt = entitlementId
		? customerProduct.customer_entitlements.find(
				(cusEnt) => cusEnt.entitlement_id === entitlementId,
			)
		: undefined;
	if (!oldCusEnt) return undefined;

	const cusEntWithProduct = addCusProductToCusEnt({
		cusEnt: oldCusEnt,
		cusProduct: customerProduct,
	});

	const overage = cusEntToPrepaidInvoiceOverage({ cusEnt: cusEntWithProduct });
	const allowance = cusEntsToAllowance({ cusEnts: [cusEntWithProduct] });

	return priceToLineAmount({ price: oldCusPrice.price, overage, allowance });
};

/**
 * Picks the total-inclusive quantity boundary (allowance + purchased) for the
 * highest new tier whose flat_amount is at-or-below the given amount. If the
 * customer's current spend doesn't clear even the cheapest paid tier, they land
 * on the new item's included amount only — no purchase, matching "round to the
 * lowest price" floor semantics — rather than throwing.
 */
const pickLowestPriceTier = ({
	newItem,
	amount,
}: {
	newItem: CreatePlanItemParamsV1;
	amount: number;
}): number => {
	const tiers = (newItem.price?.tiers ?? []).filter(isFiniteTier);
	const eligible = tiers
		.filter((tier) => (tier.flat_amount ?? tier.amount ?? 0) <= amount)
		.sort((a, b) => a.to - b.to);

	const chosen = eligible[eligible.length - 1];
	return chosen ? chosen.to : (newItem.included ?? 0);
};

/**
 * Resolves `op.feature_quantities_strategy` entries into concrete
 * `FeatureQuantityParamsV0[]`, one per matched cusProduct. Skips entries with
 * no existing prepaid price on this cusProduct (nothing to round down from).
 */
export const resolveFeatureQuantityStrategy = ({
	strategies,
	customerProduct,
	addItems,
}: {
	strategies: MigrationFeatureQuantityStrategyParams[];
	customerProduct: FullCusProduct;
	addItems: CreatePlanItemParamsV1[] | undefined;
}): FeatureQuantityParamsV0[] => {
	const resolved: FeatureQuantityParamsV0[] = [];

	for (const { feature_id: featureId, strategy } of strategies) {
		if (strategy !== "round_to_lowest_price") continue;

		const amount = resolveCurrentAmount({ featureId, customerProduct });
		if (amount === undefined) continue;

		const newItem = addItems?.find((item) => item.feature_id === featureId);
		if (!newItem) continue;

		const quantity = pickLowestPriceTier({ newItem, amount });

		// `quantity` is total-inclusive (allowance + purchased) per volume-tier
		// semantics; feed it unchanged into feature_quantities — downstream
		// `paramsToFeatureOptions` subtracts the new entitlement's allowance
		// itself before storing to FeatureOptions.quantity. Do not subtract here.
		resolved.push({ feature_id: featureId, quantity });
	}

	return resolved;
};
