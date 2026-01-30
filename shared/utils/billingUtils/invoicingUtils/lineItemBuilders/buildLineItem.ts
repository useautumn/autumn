// shared/utils/billingUtils/invoicingUtils/lineItemBuilders/buildLineItem.ts

import {
	type LineItem,
	type LineItemCreate,
	LineItemSchema,
} from "../../../../models/billingModels/lineItem/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import { applyProration } from "../prorationUtils/applyProration";

export const buildLineItem = ({
	context,
	amount,
	description,
	stripePriceId,
	stripeProductId,
	shouldProrate = true,
	chargeImmediately = true,
	usage,
	overage,
}: {
	context: LineItemContext;
	amount: number;
	description: string;
	stripePriceId?: string;
	stripeProductId?: string;
	shouldProrate?: boolean;
	chargeImmediately?: boolean;
	usage?: number;
	overage?: number;
}): LineItem => {
	// 1. Apply proration if needed
	if (shouldProrate && context.billingPeriod) {
		amount = applyProration({
			now: context.now,
			billingPeriod: context.billingPeriod,
			amount,
		});
	}

	// 2. Handle refund direction
	if (context.direction === "refund") {
		amount = -amount;
	}

	// 3. Return LineItem
	const lineItemData = {
		amount,
		description,
		context,
		stripePriceId,
		stripeProductId,
		chargeImmediately,
		total_quantity: usage,
		paid_quantity: overage,
	} satisfies LineItemCreate;

	const result = LineItemSchema.safeParse(lineItemData);
	if (!result.success) {
		throw result.error;
	}

	return result.data;
};
