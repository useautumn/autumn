import {
	type ApiDiscount,
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	isOneOffProductV2,
	type ProductV2,
} from "@autumn/shared";

const getTargetSubscriptionIds = ({
	customer,
	entityId,
	product,
	newBillingSubscription,
}: {
	customer: FullCustomer;
	entityId: string | undefined;
	product: ProductV2;
	newBillingSubscription: boolean;
}): string[] => {
	const skipsExistingSubscription =
		newBillingSubscription || isOneOffProductV2({ items: product.items });
	if (skipsExistingSubscription) return [];

	const entity = entityId
		? customer.entities?.find(
				(customerEntity) =>
					customerEntity.id === entityId ||
					customerEntity.internal_id === entityId,
			)
		: undefined;

	const targetCustomerProduct = getTargetSubscriptionCusProduct({
		fullCus: { ...customer, entity },
		productId: product.id,
		productGroup: product.group ?? "",
	});

	return targetCustomerProduct?.subscription_ids ?? [];
};

/** Mirrors the server: the target subscription's discounts, else the customer-level ones it inherits. */
export const getAttachAppliedDiscounts = ({
	customer,
	entityId,
	product,
	newBillingSubscription,
	discounts,
}: {
	customer: FullCustomer | null;
	entityId: string | undefined;
	product: ProductV2 | undefined;
	newBillingSubscription: boolean;
	discounts: ApiDiscount[];
}): ApiDiscount[] => {
	if (!customer || !product) return [];

	const subscriptionIds = getTargetSubscriptionIds({
		customer,
		entityId,
		product,
		newBillingSubscription,
	});

	const subscriptionDiscounts = discounts.filter(
		(discount) =>
			discount.subscription_id &&
			subscriptionIds.includes(discount.subscription_id),
	);
	if (subscriptionDiscounts.length > 0) return subscriptionDiscounts;

	return discounts.filter((discount) => !discount.subscription_id);
};
