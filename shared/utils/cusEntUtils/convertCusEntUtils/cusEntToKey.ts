import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";

export const cusEntToKey = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	return `${cusEnt.id}`;
	// // Interval
	// const interval = `${cusEnt.entitlement.interval_count ?? 1}:${cusEnt.entitlement.interval}`;

	// const planId = `${cusEnt.customer_product.product_id}`;

	// const usageModel = `${cusEnt.usage_allowed}`;

	// return `${interval}:${planId}:${usageModel}`;
};
