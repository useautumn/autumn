import type { LineItem } from "../../../../models/billingModels/invoicingModels/lineItem";

// Helper function - lives in lineItemUtils
export const lineItemToCredit = (item: LineItem): LineItem => ({
	...item,
	amount: -item.amount,
	description: `Unused ${item.description}`,
});
