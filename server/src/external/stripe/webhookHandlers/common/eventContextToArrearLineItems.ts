import type { FullCusEntWithFullCusProduct, LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { BillingContext } from "@/internal/billing/v2/types";
import { setupStripeDiscountsForBilling } from "@/internal/billing/v2/providers/stripe/setup/setupStripeDiscountsForBilling";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import type { UpdateCustomerEntitlement } from "@/internal/billing/v2/types";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import {
	type BaseWebhookEventContext,
	buildBillingContextForArrearInvoice,
} from "./buildBillingContextFromWebhook";
import { logWebhookArrearLineItems } from "./logs/logWebhookArrearLineItems";

/**
 * Generates arrear (usage-in-arrear) line items from webhook event context.
 *
 * This function is used by both:
 * - `invoice.created` webhook: adds consumable usage line items to renewal invoice
 * - `subscription.deleted` webhook: creates final arrear invoice for usage
 *
 * @param ctx - Autumn context (for org currency, etc.)
 * @param eventContext - Common webhook context (stripeSubscription, stripeCustomer, fullCustomer, customerProducts, nowMs, paymentMethod)
 * @param periodEndMs - End of billing period (optional, falls back to nowMs)
 * @param cusEntFilter - Optional filter for multi-interval billing (invoice.created uses this)
 *
 * @returns Object with line items and the billing context used
 */
export const eventContextToArrearLineItems = ({
	ctx,
	eventContext,
	periodEndMs,
	cusEntFilter,
}: {
	ctx: StripeWebhookContext;
	eventContext: BaseWebhookEventContext;
	periodEndMs?: number;
	cusEntFilter?: (cusEnt: FullCusEntWithFullCusProduct) => boolean;
}): {
	lineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
	billingContext: BillingContext;
} => {
	const billingContext = buildBillingContextForArrearInvoice({
		eventContext,
		periodEndMs,
	});

	// Collect line items from all customer products
	let lineItems: LineItem[] = [];
	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];
	for (const customerProduct of eventContext.customerProducts) {
		const {
			lineItems: productLineItems,
			updateCustomerEntitlements: productUpdates,
		} = customerProductToArrearLineItems({
			ctx,
			customerProduct,
			billingContext,
			filters: { cusEntFilter },
			updateNextResetAt: true,
		});
		lineItems.push(...productLineItems);
		updateCustomerEntitlements.push(...productUpdates);
	}

	// Apply discounts to line items
	const discounts = setupStripeDiscountsForBilling({
		stripeSubscription: eventContext.stripeSubscription,
		stripeCustomer: eventContext.stripeCustomer,
	});

	if (discounts.length > 0) {
		lineItems = applyStripeDiscountsToLineItems({ lineItems, discounts });
	}

	// Log the arrear line items and customer entitlement updates
	logWebhookArrearLineItems({
		ctx,
		lineItems,
		updateCustomerEntitlements,
	});

	return { lineItems, updateCustomerEntitlements, billingContext };
};
