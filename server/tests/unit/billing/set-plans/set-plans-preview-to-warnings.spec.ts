import { describe, expect, test } from "bun:test";
import type {
	FullCusProduct,
	ProcessorItem,
	SetPlansPreviewPhase,
	StripeBillingPlan,
} from "@autumn/shared";
import type Stripe from "stripe";
import { setPlansPreviewToWarnings } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPreviewToWarnings";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";

const processorItem = (overrides: Partial<ProcessorItem>): ProcessorItem => ({
	price_id: "price_1",
	plan_id: "pro",
	feature_id: null,
	display_name: "pro",
	feature_name: null,
	quantity: 1,
	price: null,
	amount: null,
	creates_price: false,
	managed_by_autumn: true,
	...overrides,
});

const phase = (
	overrides: Partial<SetPlansPreviewPhase>,
): SetPlansPreviewPhase => ({
	starts_at: 0,
	starts_now: false,
	ends_subscription: false,
	plans: [],
	plan_changes: [],
	balance_changes: [],
	processor_items: [],
	...overrides,
});

describe("setPlansPreviewToWarnings", () => {
	test("returns no warnings for a clean preview", () => {
		expect(
			setPlansPreviewToWarnings({
				phases: [
					phase({
						processor_items: [processorItem({ price_id: "price_base" })],
					}),
				],
				liveProcessorItems: [
					processorItem({ price_id: "price_base" }),
					processorItem({ price_id: "price_old_pro" }),
				],
				processorChanges: [
					{
						type: "subscription",
						id: null,
						action: "created",
					},
				],
				deletedCustomerProducts: [],
				outgoingCustomerProducts: [],
				features: [],
			}),
		).toEqual([]);
	});

	test("derives every warning type from the preview", () => {
		const scheduledEnterprise = makeFullCusProduct({ planId: "enterprise" });
		const outgoingPro: FullCusProduct = {
			...makeFullCusProduct({ planId: "pro" }),
			options: [
				{ feature_id: "seats", quantity: 5, upcoming_quantity: 3 },
			] as FullCusProduct["options"],
		};

		const warnings = setPlansPreviewToWarnings({
			phases: [
				phase({
					balance_changes: [
						{
							feature_id: "messages",
							balance: {
								granted: 500,
								remaining: 500,
								usage: 0,
								unlimited: false,
								next_reset_at: null,
							},
							previous_attributes: { usage: 40, granted: 100 },
							behavior: "reset",
						},
					],
					processor_items: [
						processorItem({ display_name: "premium", creates_price: true }),
					],
				}),
				phase({
					processor_items: [
						processorItem({ display_name: "premium", creates_price: true }),
					],
				}),
			],
			liveProcessorItems: [
				processorItem({
					price_id: "price_support",
					display_name: "Support add-on",
					managed_by_autumn: false,
					plan_id: null,
				}),
			],
			processorChanges: [
				{
					type: "subscription_schedule",
					id: "sub_sched_old",
					action: "released",
				},
			],
			deletedCustomerProducts: [scheduledEnterprise],
			outgoingCustomerProducts: [outgoingPro],
			requestedProrationBehavior: "none",
			features: [],
		});

		expect(warnings.map((warning) => warning.type)).toEqual([
			"unmanaged_stripe_item_removed",
			"new_stripe_price_created",
			"usage_reset",
			"existing_schedule_replaced",
			"future_phase_removed",
			"pending_quantity_change_dropped",
			"proration_disabled",
		]);
		expect(warnings.map((warning) => warning.severity)).toEqual([
			"warning",
			"info",
			"warning",
			"warning",
			"warning",
			"warning",
			"info",
		]);
		expect(warnings[0].message).toContain("Support add-on");
		expect(warnings[4].message).toContain("enterprise");
	});

	test("updating a standalone schedule in place doesn't warn about replacing it", () => {
		expect(
			setPlansPreviewToWarnings({
				phases: [phase({})],
				liveProcessorItems: [],
				processorChanges: [
					{
						type: "subscription_schedule",
						id: "sub_sched_standalone",
						action: "updated",
					},
				],
				deletedCustomerProducts: [],
				outgoingCustomerProducts: [],
				features: [],
			}),
		).toEqual([]);
	});
});

const NOON_UTC = Date.UTC(2026, 8, 29, 12);
const DAY_MS = 86_400_000;

const stripeSubscription = (
	overrides: Partial<Stripe.Subscription>,
): Stripe.Subscription =>
	({
		id: "sub_old",
		status: "active",
		discounts: [],
		trial_end: null,
		...overrides,
	}) as Stripe.Subscription;

const stateWarnings = (
	overrides: Partial<Parameters<typeof setPlansPreviewToWarnings>[0]>,
) =>
	setPlansPreviewToWarnings({
		phases: [phase({})],
		liveProcessorItems: [],
		processorChanges: [],
		deletedCustomerProducts: [],
		outgoingCustomerProducts: [],
		features: [],
		...overrides,
	});

describe("setPlansPreviewToWarnings: subscription state", () => {
	test("an unpaid subscription is announced as cancelled and replaced", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				replacedStripeSubscription: stripeSubscription({
					id: "sub_unpaid",
					status: "unpaid",
				}),
			},
			stripeBillingPlan: {},
		});

		expect(warnings).toEqual([
			{
				type: "subscription_replaced",
				severity: "warning",
				message:
					"The unpaid subscription sub_unpaid will be cancelled and a new one created. Its unpaid invoices stay open.",
			},
		]);
	});

	test("a paused subscription replaced through Checkout is cancelled once checkout completes", () => {
		const [warning] = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				replacedStripeSubscription: stripeSubscription({
					id: "sub_paused",
					status: "paused",
				}),
			},
			stripeBillingPlan: {
				checkoutSessionAction: {} as StripeBillingPlan["checkoutSessionAction"],
			},
		});

		expect(warning?.message).toBe(
			"The paused subscription sub_paused will be cancelled once checkout completes and a new one created. Its unpaid invoices stay open.",
		);
	});

	test("a canceled subscription lists the new subscription, its open invoice and dropped discount", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				subscriptionBackdateStartMs: NOON_UTC - 10 * DAY_MS,
				billingCycleAnchorMs: NOON_UTC + 20 * DAY_MS,
				replacedStripeSubscription: stripeSubscription({
					id: "sub_canceled",
					status: "canceled",
					discounts: [
						{
							source: { coupon: { id: "co_launch", name: "Launch 20%" } },
						} as Stripe.Discount,
					],
				}),
				stripeDiscounts: [],
			},
			stripeBillingPlan: {},
			replacedOpenInvoices: [
				{
					id: "in_open",
					number: "INV-0001",
					amount_remaining: 2000,
					currency: "usd",
				} as Stripe.Invoice,
			],
		});

		expect(warnings).toEqual([
			{
				type: "new_stripe_subscription",
				severity: "info",
				message:
					"A new Stripe subscription will be created, starting 19 Sep 2026 and first invoiced on 19 Oct 2026.",
			},
			{
				type: "open_invoice_not_collected",
				severity: "warning",
				message:
					"Invoice INV-0001 for $20 is still open on the cancelled subscription and is not collected by this change.",
			},
			{
				type: "discount_not_carried",
				severity: "warning",
				message:
					"Discount Launch 20% from the cancelled subscription is not carried over.",
			},
		]);
	});

	test("a discount the request carries over is not flagged", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				replacedStripeSubscription: stripeSubscription({
					status: "incomplete_expired",
					discounts: [
						{ source: { coupon: { id: "co_launch" } } } as Stripe.Discount,
					],
				}),
				stripeDiscounts: [
					{ source: { coupon: { id: "co_launch" } as Stripe.Coupon } },
				],
			},
			stripeBillingPlan: {},
		});

		expect(warnings.map((warning) => warning.type)).toEqual([
			"new_stripe_subscription",
		]);
	});

	test("free_trial null on a trialing subscription warns that it bills now", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				stripeSubscription: stripeSubscription({
					status: "trialing",
					trial_end: (NOON_UTC + 7 * DAY_MS) / 1000,
				}),
				trialContext: {
					freeTrial: null,
					trialEndsAt: null,
					appliesToBilling: true,
					cardRequired: true,
				},
			},
			stripeBillingPlan: {},
		});

		expect(warnings).toEqual([
			{
				type: "trial_ended",
				severity: "warning",
				message:
					"The trial ending 06 Oct 2026 ends now and the subscription is billed immediately.",
			},
		]);
	});

	test("a carried trial on a trialing subscription doesn't warn", () => {
		const trialEndMs = NOON_UTC + 7 * DAY_MS;
		expect(
			stateWarnings({
				billingContext: {
					currentEpochMs: NOON_UTC,
					billingCycleAnchorMs: trialEndMs,
					stripeSubscription: stripeSubscription({
						status: "trialing",
						trial_end: trialEndMs / 1000,
					}),
					trialContext: {
						freeTrial: null,
						trialEndsAt: trialEndMs,
						appliesToBilling: true,
						cardRequired: true,
					},
				},
				stripeBillingPlan: {},
			}),
		).toEqual([]);
	});
});

describe("setPlansPreviewToWarnings: live subscription changes", () => {
	const liveSubscription = stripeSubscription({
		id: "sub_live",
		status: "active",
		cancel_at: (NOON_UTC + 20 * DAY_MS) / 1000,
	});

	test("clearing a scheduled cancellation is announced", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				stripeSubscription: liveSubscription,
			},
			stripeBillingPlan: {
				subscriptionAction: {
					type: "update",
					stripeSubscriptionId: "sub_live",
					params: { cancel_at: null },
				},
			},
		});

		expect(warnings).toEqual([
			{
				type: "scheduled_cancel_changed",
				severity: "warning",
				message: "The scheduled cancellation on 19 Oct 2026 is removed.",
			},
		]);
	});

	test("a schedule that ends the subscription is announced as the plans' end", () => {
		const [warning] = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				stripeSubscription: stripeSubscription({ id: "sub_live" }),
			},
			stripeBillingPlan: {
				subscriptionScheduleAction: {
					type: "create",
					params: {
						end_behavior: "cancel",
						phases: [{ items: [], end_date: (NOON_UTC + 30 * DAY_MS) / 1000 }],
					},
				},
			},
		});

		expect(warning).toEqual({
			type: "scheduled_cancel_changed",
			severity: "warning",
			message: "The plans end on 29 Oct 2026.",
		});
	});

	test("keeping the scheduled cancellation doesn't warn", () => {
		expect(
			stateWarnings({
				billingContext: {
					currentEpochMs: NOON_UTC,
					billingCycleAnchorMs: "now",
					stripeSubscription: liveSubscription,
				},
				stripeBillingPlan: {
					subscriptionAction: {
						type: "update",
						stripeSubscriptionId: "sub_live",
						params: {},
					},
				},
			}),
		).toEqual([]);
	});

	test("moving a live subscription to a new interval warns that Stripe invoices now", () => {
		const monthly = processorItem({
			price: {
				currency: "usd",
				unit_amount: 20,
				interval: "month",
				interval_count: 1,
				usage_type: "licensed",
				tiers_mode: null,
				first_tier_amount: null,
				units_per_quantity: null,
			},
		});
		const yearly = processorItem({
			price_id: "price_year",
			price: { ...monthly.price!, interval: "year", unit_amount: 200 },
		});

		const warnings = stateWarnings({
			phases: [phase({ processor_items: [yearly] })],
			liveProcessorItems: [monthly],
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				stripeSubscription: stripeSubscription({ id: "sub_live" }),
			},
			stripeBillingPlan: {},
		});

		expect(warnings).toEqual([
			{
				type: "interval_change_invoices_now",
				severity: "warning",
				message:
					"Stripe invoices the new year interval now, and the billing cycle restarts today.",
			},
		]);
	});
});
