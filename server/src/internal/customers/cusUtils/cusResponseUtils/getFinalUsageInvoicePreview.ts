import {
	type ApiInvoicePreviewV0,
	ApiInvoicePreviewV0Schema,
	type BillingContext,
	billingContextToCurrency,
	type FullCusProduct,
	ms,
	secondsToMs,
	sumValues,
} from "@autumn/shared";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { partitionSkippedOverageLineItems } from "@/external/stripe/webhookHandlers/common/filterSkippedOverageLineItems.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";
import { lineItemToPreviewLineItem } from "@/internal/billing/v2/utils/lineItems/lineItemToPreviewLineItem.js";

/**
 * The usage-only invoice a subscription still receives when nothing recurs past
 * the upcoming boundary — a plan cancelling at period end is billed for what it
 * consumed even though there is no next cycle to preview.
 *
 * Returns null when nothing is owed, which is also the answer for subscriptions
 * that simply carry no consumable prices.
 */
export const getFinalUsageInvoicePreview = ({
	ctx,
	billingContext,
	customerProducts,
	subscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	subscriptionId: string;
}): ApiInvoicePreviewV0 | null => {
	const { stripeSubscription, fullCustomer, stripeDiscounts } = billingContext;
	if (!stripeSubscription) return null;

	const periodEndMs = secondsToMs(
		getEarliestPeriodEnd({ sub: stripeSubscription }),
	);

	// Sit just inside the closing cycle so the cycle math bills what was used,
	// rather than rolling forward into a cycle that never happens.
	const arrearBillingContext: BillingContext = {
		...billingContext,
		currentEpochMs: periodEndMs - ms.minutes(30),
	};

	const arrearLineItems = customerProducts.flatMap(
		(customerProduct) =>
			customerProductToArrearLineItems({
				ctx,
				customerProduct,
				billingContext: arrearBillingContext,
				options: { updateNextResetAt: false },
			}).lineItems,
	);

	const { billableLineItems } = partitionSkippedOverageLineItems({
		fullCustomer,
		lineItems: arrearLineItems,
	});

	if (billableLineItems.length === 0) return null;

	const discountedLineItems = stripeDiscounts?.length
		? applyStripeDiscountsToLineItems({
				lineItems: billableLineItems,
				discounts: stripeDiscounts,
			})
		: billableLineItems;

	const lineItems = discountedLineItems.map(lineItemToPreviewLineItem);

	return ApiInvoicePreviewV0Schema.parse({
		object: "invoice_preview",
		subscription_id: subscriptionId,
		plan_ids: [...new Set(lineItems.map((lineItem) => lineItem.plan_id))],
		invoice_at: periodEndMs,
		currency: billingContextToCurrency({ org: ctx.org, billingContext }),
		subtotal: sumValues(lineItems.map((lineItem) => lineItem.subtotal)),
		total: sumValues(lineItems.map((lineItem) => lineItem.total)),
		line_items: lineItems,
	} satisfies ApiInvoicePreviewV0);
};
