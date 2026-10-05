/**
 * Stripe rejects trial_settings.missing_payment_method together with send_invoice,
 * so a Stripe-run no-card trial in invoice mode is created without trial_settings.
 */

import { expect, test } from "bun:test";
import type { BillingContext, InvoiceMode } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { buildStripeSubscriptionCreateAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionCreateAction";

const NOW_MS = 1_760_000_000_000;
const TRIAL_ENDS_AT_MS = NOW_MS + 7 * 24 * 60 * 60 * 1000;

const createParamsFor = ({ invoiceMode }: { invoiceMode?: InvoiceMode }) =>
	buildStripeSubscriptionCreateAction({
		ctx: contexts.create({}),
		billingContext: {
			...contexts.createBilling({ currentEpochMs: NOW_MS }),
			trialContext: {
				trialEndsAt: TRIAL_ENDS_AT_MS,
				appliesToBilling: true,
				cardRequired: false,
			},
			invoiceMode,
		} as BillingContext,
		subItemsUpdate: [],
		addInvoiceItems: [],
		autumnBillingPlan: { customerId: "cus_test", insertCustomerProducts: [] },
	}).params;

test("no-card trial without invoice mode cancels when the card is missing", () => {
	expect(createParamsFor({}).trial_settings).toEqual({
		end_behavior: { missing_payment_method: "cancel" },
	});
});

test("no-card trial in invoice mode sends no trial_settings", () => {
	expect(
		createParamsFor({
			invoiceMode: { finalizeInvoice: true, enableProductImmediately: true },
		}).trial_settings,
	).toBeUndefined();
});
