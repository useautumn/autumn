import type { BillingPlan, LineItem, PreviewLineItem } from "@autumn/shared";
import { sumValues } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { customLineItemToPreviewLineItem } from "../../lineItems/customLineItemToPreviewLineItem";
import { lineItemToPreviewLineItem } from "../../lineItems/lineItemToPreviewLineItem";

const roundAmount = ({ amount }: { amount: number }) =>
	new Decimal(amount).toDP(2).toNumber();

export const billingPlanToImmediatePreview = ({
	billingPlan,
}: {
	billingPlan: BillingPlan;
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
		const previewLineItems = customLineItems.map(
			customLineItemToPreviewLineItem,
		);
		const subtotal = roundAmount({
			amount: sumValues(customLineItems.map((item) => item.amount)),
		});

		return {
			immediateLineItems,
			previewLineItems,
			subtotal,
			total: subtotal,
		};
	}

	const previewLineItems = immediateLineItems.map(lineItemToPreviewLineItem);

	return {
		immediateLineItems,
		previewLineItems,
		subtotal: roundAmount({
			amount: sumValues(previewLineItems.map((line) => line.subtotal)),
		}),
		total: roundAmount({
			amount: sumValues(previewLineItems.map((line) => line.total)),
		}),
	};
};
