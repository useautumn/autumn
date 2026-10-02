import {
	type FullCustomer,
	type FullProduct,
	isCustomerProductPaid,
	isFreeProduct,
	type Price,
	priceAmountsForCurrency,
	productToEffectivePrices,
	RELEVANT_STATUSES,
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

/** Free in the base currency and in the sync currency, which can price a plan differently. */
export const isProductFreeInSyncCurrency = ({
	fullProduct,
	currency,
}: {
	fullProduct: FullProduct;
	currency: string;
}) =>
	isFreeProduct({ product: fullProduct }) &&
	!isPaidInCurrency({
		prices: productToEffectivePrices({ product: fullProduct }),
		currency,
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

export const customerHasLivePaidProduct = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}) =>
	fullCustomer.customer_products.some(
		(customerProduct) =>
			RELEVANT_STATUSES.includes(customerProduct.status) &&
			isCustomerProductPaid(customerProduct),
	);

/** `undefined` = don't write `customers.currency`. A value sets or relocks it. */
export const syncContextToCurrencyLock = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}) => {
	if (
		!syncContext.stripeSubscription ||
		!syncContextHasPaidProduct({ syncContext, scope: "immediate" })
	) {
		return undefined;
	}

	const currentCurrency = syncContext.fullCustomer.currency?.toLowerCase();
	if (currentCurrency === syncContext.currency) return undefined;
	// Live paid product already owns this lock; leftover currency is the relock case below.
	if (
		currentCurrency &&
		customerHasLivePaidProduct({ fullCustomer: syncContext.fullCustomer })
	) {
		return undefined;
	}

	return {
		internalCustomerId: syncContext.fullCustomer.internal_id,
		currency: syncContext.currency,
	};
};
