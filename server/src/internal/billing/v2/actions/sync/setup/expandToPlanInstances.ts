import type {
	FullCusProduct,
	FullCustomer,
	SyncProductContext,
} from "@autumn/shared";
import { planExpandsByQuantity } from "../utils/planExpandsByQuantity";
import { findLinkedPlanInstances } from "./findLinkedPlanInstances";

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
