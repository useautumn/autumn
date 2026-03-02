import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
	LineItem,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { extractStripeDiscounts } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import {
	type BaseWebhookEventContext,
	buildBillingContextForArrearInvoice,
} from "./buildBillingContextFromWebhook";
import { logWebhookArrearLineItems } from "./logs/logWebhookArrearLineItems";

/**
 * Generates arrear (usage-in-arrear) line items from webhook event context.
 *
 * Used by:
 * - `invoice.created` webhook: adds consumable usage line items to renewal invoice
 * - `subscription.deleted` webhook: creates final arrear invoice for usage
 *
 * ## Discount handling
 *
 * Line items are created with `discountable: true`, which tells Stripe to auto-apply
 * subscription/customer discounts when adding these items to an invoice.
 *
 * We also call `applyStripeDiscountsToLineItems` locally to calculate the discounted
 * amounts for our own records (stored in `amountAfterDiscounts`). This is purely for
 * audit/tracking purposes - Stripe handles the actual discount application.
 *
 * We use `skipDescriptionTag: true` so the description doesn't include "[inc. discount]"
 * since we're not pre-deducting the discount from the amount sent to Stripe.
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
			options: { updateNextResetAt: true, discountable: true },
		});
		lineItems.push(...productLineItems);
		updateCustomerEntitlements.push(...productUpdates);
	}

	// Apply discounts to line items (for our DB records)
	// Note: discountable: true lets Stripe auto-apply discounts, but we still
	// need to track discounts on our side for accurate DB storage
	const discounts = extractStripeDiscounts({
		stripeSubscription: eventContext.stripeSubscription,
		stripeCustomer: eventContext.stripeCustomer,
	});

	if (discounts.length > 0) {
		lineItems = applyStripeDiscountsToLineItems({
			lineItems,
			discounts,
			options: { skipDescriptionTag: true },
		});
	}

	// Log the arrear line items and customer entitlement updates
	logWebhookArrearLineItems({
		ctx,
		lineItems,
		updateCustomerEntitlements,
	});

	return { lineItems, updateCustomerEntitlements, billingContext };
};
