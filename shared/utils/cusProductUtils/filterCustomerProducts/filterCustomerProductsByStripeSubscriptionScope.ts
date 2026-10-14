import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import {
	isCustomerProductInStripeSubscriptionScope,
	isCustomerProductUnlinkedFree,
} from "../classifyCustomerProduct/classifyCustomerProduct";

export const filterCustomerProductsByStripeSubscriptionScope = ({
	customerProducts,
	stripeSubscriptionId,
	stripeScheduleId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
}): FullCusProduct[] =>
	customerProducts.filter(
		(customerProduct) =>
			isCustomerProductInStripeSubscriptionScope({
				customerProduct,
				stripeSubscriptionId,
				stripeSubscriptionScheduleId: stripeScheduleId,
			}) || isCustomerProductUnlinkedFree(customerProduct),
	);
