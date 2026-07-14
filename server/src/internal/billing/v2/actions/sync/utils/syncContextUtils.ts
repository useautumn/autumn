import {
	type Price,
	priceAmountsForCurrency,
	type SyncBillingContext,
} from "@autumn/shared";

const isPaidInCurrency = ({
	prices,
	currency,
}: {
	prices: Price[];
	currency: string;
}) =>
	prices.some((price) => {
		const { amount, usage_tiers: tiers } = priceAmountsForCurrency({
			config: price.config,
			currency,
		});
		return (
			(amount ?? 0) > 0 ||
			tiers?.some((tier) => tier.amount + (tier.flat_amount ?? 0) > 0)
		);
	});

export const syncContextHasPaidProduct = ({
	syncContext,
	scope = "all",
}: {
	syncContext: SyncBillingContext;
	scope?: "all" | "immediate";
}) => {
	const productContexts = [
		...(syncContext.immediatePhase?.productContexts ?? []),
		...(scope === "all"
			? syncContext.futurePhases.flatMap((phase) => phase.productContexts)
			: []),
	];
	return productContexts.some(({ fullProduct }) =>
		isPaidInCurrency({
			prices: fullProduct.prices,
			currency: syncContext.currency,
		}),
	);
};

export const syncContextToCurrencyLock = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}) => {
	if (
		!syncContext.stripeSubscription ||
		syncContext.fullCustomer.currency ||
		!syncContextHasPaidProduct({ syncContext, scope: "immediate" })
	) {
		return undefined;
	}
	return {
		internalCustomerId: syncContext.fullCustomer.internal_id,
		currency: syncContext.currency,
	};
};
