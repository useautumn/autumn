import type { FullCustomer } from "../../../models/cusModels/fullCusModel.js";

export const getCusStripeSubCount = ({
	fullCus,
}: {
	fullCus: FullCustomer;
}) => {
	return fullCus.customer_products.filter(
		(cp) => cp.subscription_ids && cp.subscription_ids.length > 0,
	).length;
};
