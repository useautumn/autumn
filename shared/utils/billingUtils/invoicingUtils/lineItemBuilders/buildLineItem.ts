// shared/utils/billingUtils/invoicingUtils/lineItemBuilders/buildLineItem.ts

import { generateKsuid } from "@autumn/ksuid";
import {
	type LineItem,
	type LineItemCreate,
	LineItemSchema,
} from "../../../../models/billingModels/lineItem/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import { applyProration } from "../prorationUtils/applyProration";
import { getEffectivePeriod } from "../prorationUtils/getEffectivePeriod";

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
	// 1. Compute effectivePeriod if not already set
	let effectivePeriod = context.effectivePeriod;
	if (!effectivePeriod && context.billingPeriod) {
		effectivePeriod = getEffectivePeriod({
			now: context.now,
			billingPeriod: context.billingPeriod,
			billingTiming: context.billingTiming,
		});
	}

	// Update context with effective period
	const updatedContext: LineItemContext = {
		...context,
		effectivePeriod,
	};

	// 2. Apply proration if needed
	let prorated = false;
	if (shouldProrate && context.billingPeriod) {
		amount = applyProration({
			now: context.now,
			billingPeriod: context.billingPeriod,
			amount,
		});
		prorated = true;
	}

	// 3. Handle refund direction
	if (context.direction === "refund") {
		amount = -amount;
	}

	// 5. Return LineItem
	const lineItemData = {
		id: generateKsuid({ prefix: "invoice_li_" }),
		amount,
		description,
		context: updatedContext,
		stripePriceId,
		stripeProductId,
		chargeImmediately,
		totalQuantity: usage,
		paidQuantity: overage,
		prorated: prorated,
	} satisfies LineItemCreate;

	const result = LineItemSchema.safeParse(lineItemData);
	if (!result.success) {
		throw result.error;
	}

	return result.data;
};
