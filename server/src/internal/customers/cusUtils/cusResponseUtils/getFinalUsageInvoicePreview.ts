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
import { shouldDisableOverageBilling } from "@/external/stripe/webhookHandlers/common/shouldDisableOverageBilling.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";
import { lineItemToPreviewLineItem } from "@/internal/billing/v2/utils/lineItems/lineItemToPreviewLineItem.js";

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

	const arrearBillingContext: BillingContext = {
		...billingContext,
		currentEpochMs: periodEndMs - ms.minutes(30),
	};

	const disableOverageBilling = shouldDisableOverageBilling({
		org: ctx.org,
		customerId: fullCustomer.id,
		customerConfig: fullCustomer.config,
	});
	const arrearResults = customerProducts.map((customerProduct) =>
		customerProductToArrearLineItems({
			ctx,
			customerProduct,
			billingContext: arrearBillingContext,
			options: {
				updateNextResetAt: false,
				invoiceCredits: { fullyOffsetOverage: disableOverageBilling },
			},
		}),
	);
	const arrearLineItems = arrearResults.flatMap((result) => result.lineItems);
	const invoiceCreditLineItems = arrearResults.flatMap(
		(result) => result.invoiceCreditLineItems,
	);

	const { billableLineItems } = partitionSkippedOverageLineItems({
		fullCustomer,
		lineItems: arrearLineItems,
	});
	const finalLineItems = [...billableLineItems, ...invoiceCreditLineItems];

	if (finalLineItems.length === 0) return null;

	const discountedLineItems = stripeDiscounts?.length
		? applyStripeDiscountsToLineItems({
				lineItems: finalLineItems,
				discounts: stripeDiscounts,
			})
		: finalLineItems;

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
