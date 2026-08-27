/**
 * Every Stripe subscription update/cancel key is classified as reserved or
 * pass-through. Reserved keys never come from the user bag; pass-through keys
 * survive when Autumn omits them; Autumn always wins collisions.
 */

import { describe, expect, test } from "bun:test";
import {
	buildStripeSubscriptionCancelParams,
	buildStripeSubscriptionUpdateParams,
	SUBSCRIPTION_CANCEL_KEY_POLICY,
	SUBSCRIPTION_UPDATE_KEY_POLICY,
} from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionParams";
import chalk from "chalk";
import type Stripe from "stripe";

const UPDATE_USER_VALUES: Record<keyof Stripe.SubscriptionUpdateParams, unknown> =
	{
		add_invoice_items: [{ price: "price_user" }],
		application_fee_percent: 10,
		automatic_tax: { enabled: true },
		billing_cadence: "cadence_user",
		billing_cycle_anchor: "now",
		billing_schedules: [{ cadence: "month" }],
		billing_thresholds: { amount_gte: 1 },
		cancel_at: 1_700_000_000,
		cancel_at_period_end: true,
		cancellation_details: {
			feedback: "too_expensive",
			comment: "user comment",
		},
		collection_method: "send_invoice",
		days_until_due: 14,
		default_payment_method: "pm_user",
		default_source: "src_user",
		default_tax_rates: ["txr_user"],
		description: "user description",
		discounts: [{ coupon: "user_coupon" }],
		expand: ["customer"],
		invoice_settings: { account_tax_ids: ["txi_user"] },
		items: [{ id: "si_user", quantity: 99 }],
		metadata: { stolen: "yes" },
		off_session: true,
		on_behalf_of: "acct_user",
		pause_collection: { behavior: "keep_as_draft" },
		payment_behavior: "allow_incomplete",
		payment_settings: { save_default_payment_method: "off" },
		pending_invoice_item_interval: { interval: "month" },
		prebilling: { iterations: 1 },
		proration_behavior: "always_invoice",
		proration_date: 1_700_000_001,
		transfer_data: { destination: "acct_user" },
		trial_end: "now",
		trial_from_plan: true,
		trial_settings: {
			end_behavior: { missing_payment_method: "cancel" },
		},
	};

const UPDATE_AUTUMN_VALUES: Record<
	keyof Stripe.SubscriptionUpdateParams,
	unknown
> = {
	add_invoice_items: [{ price: "price_autumn" }],
	application_fee_percent: 25,
	automatic_tax: { enabled: false },
	billing_cadence: "cadence_autumn",
	billing_cycle_anchor: "unchanged",
	billing_schedules: [{ cadence: "year" }],
	billing_thresholds: { amount_gte: 99 },
	cancel_at: 1_800_000_000,
	cancel_at_period_end: false,
	cancellation_details: {
		feedback: "unused",
		comment: "autumn comment",
	},
	collection_method: "charge_automatically",
	days_until_due: 30,
	default_payment_method: "pm_autumn",
	default_source: "src_autumn",
	default_tax_rates: ["txr_autumn"],
	description: "autumn description",
	discounts: [{ coupon: "autumn_coupon" }],
	expand: ["latest_invoice"],
	invoice_settings: { account_tax_ids: ["txi_autumn"] },
	items: [{ id: "si_autumn", quantity: 1 }],
	metadata: { autumn_source: "updateSubscription" },
	off_session: false,
	on_behalf_of: "acct_autumn",
	pause_collection: { behavior: "void" },
	payment_behavior: "error_if_incomplete",
	payment_settings: { save_default_payment_method: "on_subscription" },
	pending_invoice_item_interval: { interval: "year" },
	prebilling: { iterations: 3 },
	proration_behavior: "none",
	proration_date: 1_800_000_001,
	transfer_data: { destination: "acct_autumn" },
	trial_end: 1_800_000_002,
	trial_from_plan: false,
	trial_settings: {
		end_behavior: { missing_payment_method: "create_invoice" },
	},
};

const CANCEL_USER_VALUES: Record<keyof Stripe.SubscriptionCancelParams, unknown> =
	{
		cancellation_details: {
			feedback: "too_expensive",
			comment: "user comment",
		},
		expand: ["customer"],
		invoice_now: true,
		prorate: true,
	};

const CANCEL_AUTUMN_VALUES: Record<
	keyof Stripe.SubscriptionCancelParams,
	unknown
> = {
	cancellation_details: {
		feedback: "unused",
		comment: "autumn comment",
	},
	expand: ["latest_invoice"],
	invoice_now: false,
	prorate: false,
};

const updateKeys = Object.keys(
	SUBSCRIPTION_UPDATE_KEY_POLICY,
) as Array<keyof Stripe.SubscriptionUpdateParams>;

const cancelKeys = Object.keys(
	SUBSCRIPTION_CANCEL_KEY_POLICY,
) as Array<keyof Stripe.SubscriptionCancelParams>;

describe(chalk.yellowBright("subscription update key policy"), () => {
	test("classifies every Stripe.SubscriptionUpdateParams key once", () => {
		const reserved = updateKeys.filter(
			(key) => SUBSCRIPTION_UPDATE_KEY_POLICY[key] === "reserved",
		);
		const pass = updateKeys.filter(
			(key) => SUBSCRIPTION_UPDATE_KEY_POLICY[key] === "pass",
		);

		expect(new Set(updateKeys).size).toBe(updateKeys.length);
		expect(reserved.length + pass.length).toBe(updateKeys.length);
	});

	describe("reserved", () => {
		for (const key of updateKeys.filter(
			(candidate) => SUBSCRIPTION_UPDATE_KEY_POLICY[candidate] === "reserved",
		)) {
			test(`${key}: dropped when Autumn omits it`, () => {
				const params = buildStripeSubscriptionUpdateParams({
					params: {},
					subscriptionParams: { [key]: UPDATE_USER_VALUES[key] },
				});

				expect(params[key]).toBeUndefined();
			});

			test(`${key}: Autumn wins collision`, () => {
				const params = buildStripeSubscriptionUpdateParams({
					params: {
						[key]: UPDATE_AUTUMN_VALUES[key],
					} as Stripe.SubscriptionUpdateParams,
					subscriptionParams: { [key]: UPDATE_USER_VALUES[key] },
				});

				expect(params[key] as unknown).toEqual(UPDATE_AUTUMN_VALUES[key]);
			});
		}
	});

	describe("pass-through", () => {
		for (const key of updateKeys.filter(
			(candidate) => SUBSCRIPTION_UPDATE_KEY_POLICY[candidate] === "pass",
		)) {
			test(`${key}: user value survives when Autumn omits it`, () => {
				const params = buildStripeSubscriptionUpdateParams({
					params: {},
					subscriptionParams: { [key]: UPDATE_USER_VALUES[key] },
				});

				expect(params[key] as unknown).toEqual(UPDATE_USER_VALUES[key]);
			});

			test(`${key}: Autumn still wins collision`, () => {
				const params = buildStripeSubscriptionUpdateParams({
					params: {
						[key]: UPDATE_AUTUMN_VALUES[key],
					} as Stripe.SubscriptionUpdateParams,
					subscriptionParams: { [key]: UPDATE_USER_VALUES[key] },
				});

				expect(params[key] as unknown).toEqual(UPDATE_AUTUMN_VALUES[key]);
			});
		}
	});
});

describe(chalk.yellowBright("subscription cancel key policy"), () => {
	test("classifies every Stripe.SubscriptionCancelParams key once", () => {
		const reserved = cancelKeys.filter(
			(key) => SUBSCRIPTION_CANCEL_KEY_POLICY[key] === "reserved",
		);
		const pass = cancelKeys.filter(
			(key) => SUBSCRIPTION_CANCEL_KEY_POLICY[key] === "pass",
		);

		expect(new Set(cancelKeys).size).toBe(cancelKeys.length);
		expect(reserved.length + pass.length).toBe(cancelKeys.length);
	});

	describe("reserved", () => {
		for (const key of cancelKeys.filter(
			(candidate) => SUBSCRIPTION_CANCEL_KEY_POLICY[candidate] === "reserved",
		)) {
			test(`${key}: dropped when Autumn omits it`, () => {
				const params = buildStripeSubscriptionCancelParams({
					params: {},
					subscriptionParams: { [key]: CANCEL_USER_VALUES[key] },
				});

				expect(params[key]).toBeUndefined();
			});

			test(`${key}: Autumn wins collision`, () => {
				const params = buildStripeSubscriptionCancelParams({
					params: {
						[key]: CANCEL_AUTUMN_VALUES[key],
					} as Stripe.SubscriptionCancelParams,
					subscriptionParams: { [key]: CANCEL_USER_VALUES[key] },
				});

				expect(params[key] as unknown).toEqual(CANCEL_AUTUMN_VALUES[key]);
			});
		}
	});

	describe("pass-through", () => {
		for (const key of cancelKeys.filter(
			(candidate) => SUBSCRIPTION_CANCEL_KEY_POLICY[candidate] === "pass",
		)) {
			test(`${key}: user value survives when Autumn omits it`, () => {
				const params = buildStripeSubscriptionCancelParams({
					params: {},
					subscriptionParams: { [key]: CANCEL_USER_VALUES[key] },
				});

				expect(params[key] as unknown).toEqual(CANCEL_USER_VALUES[key]);
			});

			test(`${key}: Autumn still wins collision`, () => {
				const params = buildStripeSubscriptionCancelParams({
					params: {
						[key]: CANCEL_AUTUMN_VALUES[key],
					} as Stripe.SubscriptionCancelParams,
					subscriptionParams: { [key]: CANCEL_USER_VALUES[key] },
				});

				expect(params[key] as unknown).toEqual(CANCEL_AUTUMN_VALUES[key]);
			});
		}
	});
});
