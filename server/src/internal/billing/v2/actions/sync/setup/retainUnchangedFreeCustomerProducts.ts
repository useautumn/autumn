import type {
	FullCusProduct,
	FullCustomer,
	SyncProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findUnchangedFreeCustomerProduct } from "./findUnchangedFreeCustomerProduct";

type RetainedFreeCustomerProducts = {
	productContexts: SyncProductContext[];
	retainedCustomerProducts: FullCusProduct[];
};

const withoutRetainedCurrentCustomerProduct = ({
	productContext,
	retainedCustomerProductIds,
}: {
	productContext: SyncProductContext;
	retainedCustomerProductIds: ReadonlySet<string>;
}): SyncProductContext => {
	const { currentCustomerProduct } = productContext;
	if (!currentCustomerProduct) return productContext;
	if (!retainedCustomerProductIds.has(currentCustomerProduct.id)) {
		return productContext;
	}
	return { ...productContext, currentCustomerProduct: undefined };
};

/** Plans starting now keep the customer-wide free row they repeat unchanged. A row a
 * later phase repeats or replaces is re-inserted instead, so it ends at that phase. */
export const retainUnchangedFreeCustomerProducts = ({
	ctx,
	fullCustomer,
	currency,
	productContexts,
	laterProductContexts,
	retainedCustomerProductIds,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	currency: string;
	productContexts: SyncProductContext[];
	laterProductContexts: SyncProductContext[];
	retainedCustomerProductIds: Set<string>;
}): RetainedFreeCustomerProducts => {
	const laterProductIds = new Set(
		laterProductContexts.map(({ fullProduct }) => fullProduct.id),
	);
	const claimedCustomerProductIds = new Set([
		...retainedCustomerProductIds,
		...laterProductContexts.flatMap(({ currentCustomerProduct }) =>
			currentCustomerProduct ? [currentCustomerProduct.id] : [],
		),
	]);

	const result: RetainedFreeCustomerProducts = {
		productContexts: [],
		retainedCustomerProducts: [],
	};
	for (const productContext of productContexts) {
		const unchangedCustomerProduct = laterProductIds.has(
			productContext.fullProduct.id,
		)
			? undefined
			: findUnchangedFreeCustomerProduct({
					ctx,
					fullCustomer,
					productContext,
					currency,
					claimedCustomerProductIds,
				});

		if (unchangedCustomerProduct) {
			claimedCustomerProductIds.add(unchangedCustomerProduct.id);
			retainedCustomerProductIds.add(unchangedCustomerProduct.id);
			result.retainedCustomerProducts.push(unchangedCustomerProduct);
			continue;
		}

		result.productContexts.push(
			withoutRetainedCurrentCustomerProduct({
				productContext,
				retainedCustomerProductIds,
			}),
		);
	}
	return result;
};
