import type { BillingContext } from "@autumn/shared";
import {
	BillingVersion,
	type FullCusProduct,
	type FullCustomer,
	ms,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";

/**
 * Common fields between InvoiceCreatedContext and StripeSubscriptionDeletedContext.
 *
 * Discounts can be accessed from:
 * - `stripeSubscription.discounts` (subscription-level discounts)
 * - `stripeCustomer.discount` (customer-level discount)
 */
export interface BaseWebhookEventContext {
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer: ExpandedStripeCustomer;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	nowMs: number;
	paymentMethod: Stripe.PaymentMethod | null;
}

/**
 * Builds a BillingContext for generating arrear (usage-in-arrear) invoice line items
 * from Stripe webhook events.
 *
 * This function is used by both:
 * - `invoice.created` webhook: to add consumable usage line items to the renewal invoice
 * - `subscription.deleted` webhook: to create a final arrear invoice for usage
 *
 * @param eventContext - Common webhook context fields shared by both event types
 * @param eventContext.stripeSubscription - The expanded Stripe subscription
 * @param eventContext.fullCustomer - The full customer object from Autumn DB
 * @param eventContext.nowMs - Current time in ms (respecting test clocks)
 * @param eventContext.paymentMethod - Customer's payment method for the invoice
 *
 * @param periodEndMs - The end of the billing period being invoiced (in milliseconds).
 *   If not provided, falls back to `eventContext.nowMs`.
 *   - For `invoice.created`: use `secondsToMs(stripeInvoice.period_end)`
 *   - For `subscription.deleted`: use `secondsToMs(stripeSubscription.ended_at)` if available
 *
 * @returns A BillingContext configured for arrear line item generation
 *
 * @remarks
 * **Why we use "just before" the period end:**
 *
 * The billing period calculation functions (`getCycleStart`, `getCycleEnd`) determine
 * which cycle a given timestamp falls into. If we pass exactly `periodEndMs` (e.g., Feb 1),
 * the functions will return the NEW cycle (Feb 1 - Mar 1) instead of the OLD cycle
 * (Jan 1 - Feb 1) that we actually want to bill for.
 *
 * By subtracting 30 minutes, we ensure we're still "within" the old cycle:
 * ```
 * periodEndMs = Feb 1 00:00:00
 * justBeforePeriodEndMs = Jan 31 23:30:00
 *
 * getCycleStart(now = Jan 31 23:30) → Jan 1  ✓ (old cycle)
 * getCycleEnd(now = Jan 31 23:30)   → Feb 1  ✓ (old cycle)
 * ```
 */
export const buildBillingContextForArrearInvoice = ({
	eventContext,
	periodEndMs,
}: {
	eventContext: BaseWebhookEventContext;
	periodEndMs?: number;
}): BillingContext => {
	const { stripeSubscription, fullCustomer, paymentMethod, nowMs } =
		eventContext;

	// Use periodEndMs if provided, otherwise fall back to nowMs
	const effectivePeriodEndMs = periodEndMs ?? nowMs;

	// Use "just before" period end so getCycleStart/getCycleEnd return the OLD cycle
	// that just ended, not the NEW cycle that's starting.
	// See JSDoc above for detailed explanation.
	const justBeforePeriodEndMs = effectivePeriodEndMs - ms.minutes(30);

	return {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],

		currentEpochMs: justBeforePeriodEndMs,
		billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
		resetCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),

		stripeCustomer: stripeSubscription.customer,
		stripeSubscription,
		paymentMethod: paymentMethod ?? undefined,

		billingVersion: BillingVersion.V2,
	};
};
