// shared/utils/billingUtils/invoicingUtils/lineItemBuilders/buildLineItem.ts

import {
	type LineItem,
	type LineItemCreate,
	LineItemSchema,
} from "../../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import { applyProration } from "../prorationUtils/applyProration";

export const buildLineItem = ({
	context,
	amount,
	description,
	stripePriceId,
	stripeProductId,
	shouldProrate = true,
}: {
	context: LineItemContext;
	amount: number;
	description: string;
	stripePriceId?: string;
	stripeProductId?: string;
	shouldProrate?: boolean;
}): LineItem => {
	// 1. Apply proration if needed
	if (shouldProrate) {
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
	return LineItemSchema.parse({
		amount,
		description,
		context,
		stripePriceId,
		stripeProductId,
	} satisfies LineItemCreate);
};
