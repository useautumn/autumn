import {
	type ApiDiscount,
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	isOneOffProductV2,
	type ProductV2,
} from "@autumn/shared";
import { filterSubscriptionDiscounts } from "@/components/forms/shared/utils/filterSubscriptionDiscounts";

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

/** Discounts on the subscription the plan joins. */
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

	return filterSubscriptionDiscounts({
		discounts,
		subscriptionIds: getTargetSubscriptionIds({
			customer,
			entityId,
			product,
			newBillingSubscription,
		}),
	});
};
