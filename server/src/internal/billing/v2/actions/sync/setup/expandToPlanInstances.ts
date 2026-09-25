import type {
	FullCusProduct,
	FullCustomer,
	SyncProductContext,
} from "@autumn/shared";
import { planExpandsByQuantity } from "../utils/planExpandsByQuantity";
import { findLinkedPlanInstances } from "./findLinkedPlanInstances";

/** The replaced row plus every other instance of its plan on the subscription. */
const findOutgoingInstances = ({
	fullCustomer,
	currentCustomerProduct,
	stripeSubscriptionId,
}: {
	fullCustomer: FullCustomer;
	currentCustomerProduct?: FullCusProduct;
	stripeSubscriptionId?: string;
}): FullCusProduct[] => {
	if (!currentCustomerProduct) return [];
	if (!stripeSubscriptionId) return [currentCustomerProduct];

	const siblings = findLinkedPlanInstances({
		fullCustomer,
		productId: currentCustomerProduct.product.id,
		stripeSubscriptionId,
		internalEntityId: currentCustomerProduct.internal_entity_id ?? undefined,
	}).filter((instance) => instance.id !== currentCustomerProduct.id);
	return [currentCustomerProduct, ...siblings];
};

/**
 * A plan with quantity N becomes N product contexts, one cusProduct per
 * instance. Each new row replaces one outgoing instance; outgoing instances
 * left over are superseded by the first, so a re-sync converges on N rows.
 */
export const expandToPlanInstances = ({
	fullCustomer,
	productContext,
	stripeSubscriptionId,
}: {
	fullCustomer: FullCustomer;
	productContext: SyncProductContext;
	stripeSubscriptionId?: string;
}): SyncProductContext[] => {
	const expands = planExpandsByQuantity({
		plan: productContext.plan,
		isAddOn: productContext.fullProduct.is_add_on === true,
	});
	const requested = expands ? (productContext.plan.quantity ?? 1) : 1;
	const outgoing = findOutgoingInstances({
		fullCustomer,
		currentCustomerProduct: productContext.currentCustomerProduct,
		stripeSubscriptionId,
	});

	return Array.from({ length: requested }, (_, index) => ({
		...productContext,
		currentCustomerProduct: outgoing[index],
		supersededInstances: index === 0 ? outgoing.slice(requested) : undefined,
	}));
};
