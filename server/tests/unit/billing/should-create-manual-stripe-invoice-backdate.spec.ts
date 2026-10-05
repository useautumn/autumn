/** A subscription recreated for a backdate bills nothing until the old period end, so its plan changes get their own invoice. */

import { describe, expect, test } from "bun:test";
import type {
	AutumnBillingPlan,
	BillingContext,
	LineItem,
	StripeSubscriptionAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { shouldCreateManualStripeInvoice } from "@/internal/billing/v2/providers/stripe/utils/invoices/shouldCreateManualStripeInvoice";

const backdateRecreate = {
	currentEpochMs: 1_800_000_000_000,
	subscriptionBackdateStartMs: 1_796_000_000_000,
	replacedStripeSubscription: {
		id: "sub_live",
		status: "active",
	} as Stripe.Subscription,
} as BillingContext;

const createAction = {
	type: "create",
	params: {},
} as StripeSubscriptionAction;

const planWithLines = (amounts: number[]) =>
	({
		lineItems: amounts.map(
			(amount) => ({ amountAfterDiscounts: amount }) as LineItem,
		),
	}) as AutumnBillingPlan;

describe("shouldCreateManualStripeInvoice: backdate recreate", () => {
	test("a plan change is invoiced on its own", () => {
		expect(
			shouldCreateManualStripeInvoice({
				ctx: {} as AutumnContext,
				billingContext: backdateRecreate,
				autumnBillingPlan: planWithLines([-13.55, 33.87]),
				stripeSubscriptionAction: createAction,
			}),
		).toBe(true);
	});

	test("only moving the start date invoices nothing", () => {
		expect(
			shouldCreateManualStripeInvoice({
				ctx: {} as AutumnContext,
				billingContext: backdateRecreate,
				autumnBillingPlan: planWithLines([]),
				stripeSubscriptionAction: createAction,
			}),
		).toBe(false);
	});
});
