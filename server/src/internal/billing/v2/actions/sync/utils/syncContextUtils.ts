import { isFreeProduct, type SyncBillingContext } from "@autumn/shared";

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
	return productContexts.some(
		({ fullProduct }) => !isFreeProduct({ prices: fullProduct.prices }),
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
