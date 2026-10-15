import type {
	BillingContext,
	BillingPlan,
	LineItem,
	PreviewLineItem,
} from "@autumn/shared";
import { customLineItemsToLineItems } from "../../lineItems/customLineItemsToLineItems";
import { customLineItemToPreviewLineItem } from "../../lineItems/customLineItemToPreviewLineItem";
import { lineItemToPreviewLineItem } from "../../lineItems/lineItemToPreviewLineItem";
import { sumLineAmounts } from "../../lineItems/sumLineAmounts";

export const billingPlanToImmediatePreview = ({
	billingContext,
	billingPlan,
	currency,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	currency: string;
}): {
	immediateLineItems: LineItem[];
	previewLineItems: PreviewLineItem[];
	subtotal: number;
	total: number;
} => {
	const autumnBillingPlan = billingPlan.autumn;
	const { customLineItems } = autumnBillingPlan;
	const allLineItems = autumnBillingPlan.lineItems ?? [];
	const immediateLineItems = allLineItems.filter(
		(line) => line.chargeImmediately,
	);

	if (customLineItems?.length) {
		const customLineItemsWithDiscounts = customLineItemsToLineItems({
			customLineItems,
			currency,
			stripeDiscounts: billingContext.stripeDiscounts ?? [],
		});
		const previewLineItems = customLineItems.map((item, index) =>
			customLineItemToPreviewLineItem(
				item,
				customLineItemsWithDiscounts[index],
			),
		);
		const subtotal = sumLineAmounts({
			amounts: customLineItems.map((item) => item.amount),
			currency,
		});

		return {
			immediateLineItems,
			previewLineItems,
			subtotal,
			total: sumLineAmounts({
				amounts: previewLineItems.map((line) => line.total),
				currency,
			}),
		};
	}

	const previewLineItems = immediateLineItems.map(lineItemToPreviewLineItem);

	return {
		immediateLineItems,
		previewLineItems,
		subtotal: sumLineAmounts({
			amounts: previewLineItems.map((line) => line.subtotal),
			currency,
		}),
		total: sumLineAmounts({
			amounts: previewLineItems.map((line) => line.total),
			currency,
		}),
	};
};
