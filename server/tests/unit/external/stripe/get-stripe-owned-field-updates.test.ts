import { describe, expect, test } from "bun:test";
import { CollectionMethod } from "@autumn/shared";
import { getStripeOwnedFieldUpdates } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncCustomerProductStatus/getStripeOwnedFieldUpdates";

const AUTUMN_ONLY_TRIAL_ENDS_AT = 1_794_350_340_202;
const STRIPE_TRIAL_END_MS = 1_790_000_000_000;

describe("getStripeOwnedFieldUpdates", () => {
	test("does not erase an Autumn-only trial when Stripe did not change trial_end", () => {
		const updates = getStripeOwnedFieldUpdates({
			previousAttributes: { items: undefined },
			current: {
				trial_ends_at: AUTUMN_ONLY_TRIAL_ENDS_AT,
				collection_method: CollectionMethod.ChargeAutomatically,
			},
			stripeTrialEndsAt: undefined,
			stripeCollectionMethod: CollectionMethod.SendInvoice,
		});

		expect(updates).toEqual({});
	});

	test("mirrors trial_end when Stripe changed it", () => {
		const updates = getStripeOwnedFieldUpdates({
			previousAttributes: { trial_end: null },
			current: {
				trial_ends_at: null,
				collection_method: CollectionMethod.ChargeAutomatically,
			},
			stripeTrialEndsAt: STRIPE_TRIAL_END_MS,
			stripeCollectionMethod: CollectionMethod.ChargeAutomatically,
		});

		expect(updates).toEqual({ trial_ends_at: STRIPE_TRIAL_END_MS });
	});

	test("clears trial_ends_at when Stripe explicitly ended the trial", () => {
		const updates = getStripeOwnedFieldUpdates({
			previousAttributes: { trial_end: STRIPE_TRIAL_END_MS / 1000 },
			current: {
				trial_ends_at: STRIPE_TRIAL_END_MS,
				collection_method: CollectionMethod.ChargeAutomatically,
			},
			stripeTrialEndsAt: undefined,
			stripeCollectionMethod: CollectionMethod.ChargeAutomatically,
		});

		expect(updates).toEqual({ trial_ends_at: null });
	});

	test("skips trial_ends_at when Stripe changed it to the value Autumn already has", () => {
		const updates = getStripeOwnedFieldUpdates({
			previousAttributes: { trial_end: null },
			current: {
				trial_ends_at: STRIPE_TRIAL_END_MS,
				collection_method: CollectionMethod.ChargeAutomatically,
			},
			stripeTrialEndsAt: STRIPE_TRIAL_END_MS,
			stripeCollectionMethod: CollectionMethod.ChargeAutomatically,
		});

		expect(updates).toEqual({});
	});

	test("mirrors collection_method only when Stripe changed it", () => {
		const changed = getStripeOwnedFieldUpdates({
			previousAttributes: { collection_method: "charge_automatically" },
			current: {
				trial_ends_at: null,
				collection_method: CollectionMethod.ChargeAutomatically,
			},
			stripeTrialEndsAt: undefined,
			stripeCollectionMethod: CollectionMethod.SendInvoice,
		});
		expect(changed).toEqual({
			collection_method: CollectionMethod.SendInvoice,
		});

		const unchanged = getStripeOwnedFieldUpdates({
			previousAttributes: { status: "trialing" },
			current: {
				trial_ends_at: null,
				collection_method: CollectionMethod.ChargeAutomatically,
			},
			stripeTrialEndsAt: undefined,
			stripeCollectionMethod: CollectionMethod.SendInvoice,
		});
		expect(unchanged).toEqual({});
	});

	test("blind bulk write (no current) writes every field Stripe changed and nothing else", () => {
		const trialOnly = getStripeOwnedFieldUpdates({
			previousAttributes: { trial_end: STRIPE_TRIAL_END_MS / 1000 },
			stripeTrialEndsAt: undefined,
			stripeCollectionMethod: CollectionMethod.SendInvoice,
		});
		expect(trialOnly).toEqual({ trial_ends_at: null });

		const nothing = getStripeOwnedFieldUpdates({
			previousAttributes: { status: "active" },
			stripeTrialEndsAt: undefined,
			stripeCollectionMethod: CollectionMethod.SendInvoice,
		});
		expect(nothing).toEqual({});
	});
});
