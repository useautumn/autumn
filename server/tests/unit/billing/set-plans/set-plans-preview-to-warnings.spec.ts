import { describe, expect, test } from "bun:test";
import type {
	FullCusProduct,
	LineItem,
	ProcessorItem,
	SetPlansPreviewBalanceChange,
	SetPlansPreviewPhase,
	SetPlansPreviewWarning,
	StripeBillingPlan,
} from "@autumn/shared";
import { BillingInterval, textPartsToText } from "@autumn/shared";
import type Stripe from "stripe";
import { setPlansPreviewToWarnings } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPreviewToWarnings";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";

/** Wording is asserted on the message; the bold parts have their own test. */
const withoutParts = <Warning extends { parts?: unknown }>({
	parts: _parts,
	...warning
}: Warning) => warning;

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

const resetMessages = ({
	entityId = null,
}: {
	entityId?: string | null;
} = {}): SetPlansPreviewBalanceChange => ({
	feature_id: "messages",
	entity_id: entityId,
	balance: {
		granted: 500,
		remaining: 500,
		usage: 0,
		unlimited: false,
		next_reset_at: null,
		overage_allowed: false,
	},
	previous_attributes: { usage: 40, granted: 100 },
	behavior: "reset",
});

const MESSAGE_ONLY_WARNING_TYPES: SetPlansPreviewWarning["type"][] = [
	"existing_schedule_replaced",
	"proration_disabled",
];

const noSubscriptionState = {
	billingContext: { currentEpochMs: 0, billingCycleAnchorMs: "now" as const },
	stripeBillingPlan: {},
	replacedOpenInvoices: [],
	liveOpenInvoices: [],
	requestedAnchorResetMs: undefined,
};

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
				withdrawnCustomerProducts: [],
				outgoingCustomerProducts: [],
				features: [],
				...noSubscriptionState,
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
					balance_changes: [resetMessages()],
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
			withdrawnCustomerProducts: [scheduledEnterprise],
			outgoingCustomerProducts: [outgoingPro],
			requestedProrationBehavior: "none",
			features: [],
			...noSubscriptionState,
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
		expect(
			warnings[4].parts?.filter((part) => part.bold).map((part) => part.text),
		).toEqual([scheduledEnterprise.product.name]);
		const warningsWithParts = warnings.filter(
			(warning) => !MESSAGE_ONLY_WARNING_TYPES.includes(warning.type),
		);
		expect(warningsWithParts).toHaveLength(5);
		for (const warning of warningsWithParts) {
			expect(warning.parts).toBeDefined();
			expect(textPartsToText(warning.parts ?? [])).toBe(warning.message);
		}
	});

	test("a reset confined to a later phase still warns that usage restarts", () => {
		const warnings = setPlansPreviewToWarnings({
			phases: [phase({}), phase({ balance_changes: [resetMessages()] })],
			liveProcessorItems: [],
			processorChanges: [],
			withdrawnCustomerProducts: [],
			outgoingCustomerProducts: [],
			features: [],
			...noSubscriptionState,
		});

		expect(warnings.map((warning) => warning.type)).toEqual(["usage_reset"]);
	});

	test("an updated allowance that clears usage warns that usage restarts", () => {
		const warnings = setPlansPreviewToWarnings({
			phases: [
				phase({
					balance_changes: [{ ...resetMessages(), behavior: "updated" }],
				}),
			],
			liveProcessorItems: [],
			processorChanges: [],
			withdrawnCustomerProducts: [],
			outgoingCustomerProducts: [],
			features: [],
			...noSubscriptionState,
		});

		expect(warnings.map((warning) => warning.type)).toContain("usage_reset");
	});

	test("a feature the request resets in several phases and scopes warns once", () => {
		const warnings = setPlansPreviewToWarnings({
			phases: [
				phase({
					balance_changes: [
						resetMessages(),
						resetMessages({ entityId: "ent_a" }),
					],
				}),
				phase({ balance_changes: [resetMessages()] }),
			],
			liveProcessorItems: [],
			processorChanges: [],
			withdrawnCustomerProducts: [],
			outgoingCustomerProducts: [],
			features: [],
			...noSubscriptionState,
		});

		expect(
			warnings.filter((warning) => warning.type === "usage_reset"),
		).toHaveLength(1);
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
				withdrawnCustomerProducts: [],
				outgoingCustomerProducts: [],
				features: [],
				...noSubscriptionState,
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

const createsSubscription: Pick<StripeBillingPlan, "subscriptionAction"> = {
	subscriptionAction: {
		type: "create",
		params: {},
	} as StripeBillingPlan["subscriptionAction"],
};

const chargedNowLineItem = ({
	amount,
	interval,
}: {
	amount: number;
	interval: BillingInterval;
}) =>
	({
		amountAfterDiscounts: amount,
		chargeImmediately: true,
		context: { price: { config: { interval } } },
	}) as LineItem;

const stateWarnings = (
	overrides: Partial<Parameters<typeof setPlansPreviewToWarnings>[0]>,
) =>
	setPlansPreviewToWarnings({
		phases: [phase({})],
		liveProcessorItems: [],
		processorChanges: [],
		withdrawnCustomerProducts: [],
		outgoingCustomerProducts: [],
		features: [],
		...noSubscriptionState,
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

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "subscription_replaced",
				severity: "warning",
				message:
					"The unpaid subscription sub_unpaid will be cancelled and a new one created. Its unpaid invoices stay open.",
			},
		]);
	});

	test("an incomplete subscription says its first invoice is voided, not left open", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				replacedStripeSubscription: stripeSubscription({
					id: "sub_incomplete",
					status: "incomplete",
				}),
			},
			stripeBillingPlan: {},
			replacedOpenInvoices: [
				{
					id: "in_first",
					number: "INV-0001",
					amount_remaining: 2000,
					currency: "usd",
				} as Stripe.Invoice,
			],
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "subscription_replaced",
				severity: "warning",
				message:
					"The incomplete subscription sub_incomplete will be cancelled and a new one created. Stripe voids its first invoice.",
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
			stripeBillingPlan: createsSubscription,
			replacedOpenInvoices: [
				{
					id: "in_open",
					number: "INV-0001",
					amount_remaining: 2000,
					currency: "usd",
				} as Stripe.Invoice,
			],
		});

		expect(warnings.map(withoutParts)).toEqual([
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

	test("a backdate over a live subscription says it is recreated and when billing continues", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				subscriptionBackdateStartMs: NOON_UTC - 40 * DAY_MS,
				billingCycleAnchorMs: NOON_UTC + 12 * DAY_MS,
				replacedStripeSubscription: stripeSubscription({
					id: "sub_live",
					status: "active",
				}),
				stripeDiscounts: [],
			},
			stripeBillingPlan: {
				...createsSubscription,
				replacedSubscriptionAction: {
					type: "cancel",
					stripeSubscriptionId: "sub_live",
					reason: "backdate",
				},
			},
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "subscription_recreated_backdated",
				severity: "warning",
				message:
					"The current subscription will be cancelled and recreated starting 20 Aug 2026; billing continues from 11 Oct 2026.",
			},
		]);
	});

	test("a customer with no subscription is told a new one will be created", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: NOON_UTC + 30 * DAY_MS,
			},
			stripeBillingPlan: createsSubscription,
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "new_stripe_subscription",
				severity: "info",
				message:
					"A new Stripe subscription will be created, starting 29 Sep 2026 and first invoiced on 29 Oct 2026.",
			},
		]);
	});

	test("no warning when no Stripe subscription is created", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				replacedStripeSubscription: stripeSubscription({ status: "canceled" }),
			},
			stripeBillingPlan: {},
		});

		expect(warnings).toEqual([]);
	});

	test("a future first phase says when billing starts", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				billingStartsAt: NOON_UTC + 7 * DAY_MS,
			},
		});

		expect(warnings).toEqual([
			{
				type: "billing_starts_later",
				severity: "info",
				message:
					"Billing starts on 06 Oct 2026, when the first invoice is sent.",
				parts: [
					{ text: "Billing starts on" },
					{ text: "06 Oct 2026,", bold: true },
					{ text: "when the first invoice is sent." },
				],
			},
		]);
	});

	test("early access says the plans are usable before billing starts", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				billingStartsAt: NOON_UTC + 7 * DAY_MS,
				accessStartsAt: NOON_UTC,
			},
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "billing_starts_later",
				severity: "info",
				message:
					"Access starts now. Billing starts on 06 Oct 2026, when the first invoice is sent.",
			},
		]);
	});

	test("an ongoing plan charged now is billed now, and the rest from the start", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				billingStartsAt: NOON_UTC + 7 * DAY_MS,
			},
			lineItems: [
				chargedNowLineItem({ amount: 20, interval: BillingInterval.Month }),
			],
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "billing_starts_later",
				severity: "info",
				message:
					"Ongoing plans are billed now. Billing for the other plans starts on 06 Oct 2026.",
			},
		]);
	});

	test("a one-off charged now still says billing starts later", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				billingStartsAt: NOON_UTC + 7 * DAY_MS,
			},
			lineItems: [
				chargedNowLineItem({ amount: 20, interval: BillingInterval.OneOff }),
			],
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "billing_starts_later",
				severity: "info",
				message:
					"Billing starts on 06 Oct 2026, when the first invoice is sent.",
			},
		]);
	});

	test("a credit now still says billing starts later", () => {
		const warnings = stateWarnings({
			billingContext: {
				currentEpochMs: NOON_UTC,
				billingCycleAnchorMs: "now",
				billingStartsAt: NOON_UTC + 7 * DAY_MS,
			},
			lineItems: [
				chargedNowLineItem({ amount: -20, interval: BillingInterval.Month }),
			],
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "billing_starts_later",
				severity: "info",
				message:
					"Billing starts on 06 Oct 2026, when the first invoice is sent.",
			},
		]);
	});

	test("a first phase that starts now doesn't say billing starts later", () => {
		expect(
			stateWarnings({
				billingContext: {
					currentEpochMs: NOON_UTC,
					billingCycleAnchorMs: "now",
					billingStartsAt: NOON_UTC,
				},
			}),
		).toEqual([]);
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
			stripeBillingPlan: createsSubscription,
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

		expect(warnings.map(withoutParts)).toEqual([
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

		expect(warnings.map(withoutParts)).toEqual([
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

		expect(warning && withoutParts(warning)).toEqual({
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

	test("a schedule phase that resets the anchor announces the cycle reset", () => {
		const resetAtMs = NOON_UTC + 10 * DAY_MS;

		const warnings = stateWarnings({
			requestedAnchorResetMs: resetAtMs,
			stripeBillingPlan: {
				subscriptionScheduleAction: {
					type: "create",
					params: {
						phases: [
							{ items: [], end_date: resetAtMs / 1000 },
							{
								items: [],
								start_date: resetAtMs / 1000,
								billing_cycle_anchor: "phase_start",
							},
						],
					},
				},
			},
		});

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "cycle_reset",
				severity: "warning",
				message: "The billing cycle resets on 09 Oct 2026.",
			},
		]);
	});

	test("an anchor the billing plan never applies doesn't announce a cycle reset", () => {
		expect(
			stateWarnings({
				requestedAnchorResetMs: NOON_UTC + 10 * DAY_MS,
				stripeBillingPlan: {},
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
				tiers: null,
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

		expect(warnings.map(withoutParts)).toEqual([
			{
				type: "interval_change_invoices_now",
				severity: "warning",
				message:
					"Stripe invoices the new year interval now, and the billing cycle restarts today.",
			},
		]);
	});
});

describe("setPlansPreviewToWarnings: unbilled usage", () => {
	const usageLineItem = ({ amount }: { amount: number }) =>
		({
			amount,
			context: {
				currency: "usd",
				effectivePeriod: { start: NOON_UTC - 10 * DAY_MS, end: NOON_UTC },
			},
		}) as LineItem;

	test("usage on the cancelled subscription that is never invoiced is shown", () => {
		expect(
			stateWarnings({
				unbilledUsageLineItems: [
					usageLineItem({ amount: 12.5 }),
					usageLineItem({ amount: 7.5 }),
				],
			}).map(withoutParts),
		).toEqual([
			{
				type: "usage_not_billed",
				severity: "warning",
				message: "$20 of usage since 19 Sep 2026 is not billed.",
			},
		]);
	});

	test("zero usage doesn't warn", () => {
		expect(
			stateWarnings({
				unbilledUsageLineItems: [usageLineItem({ amount: 0 })],
			}),
		).toEqual([]);
	});
});

describe("setPlansPreviewToWarnings: past_due subscription", () => {
	const openInvoice = {
		id: "in_retry",
		number: "INV-0002",
		amount_remaining: 2000,
		currency: "usd",
	} as Stripe.Invoice;

	test("an open invoice on a past_due subscription is noted as still retried", () => {
		expect(
			stateWarnings({
				billingContext: {
					currentEpochMs: NOON_UTC,
					billingCycleAnchorMs: "now",
					stripeSubscription: stripeSubscription({ status: "past_due" }),
				},
				stripeBillingPlan: {},
				liveOpenInvoices: [openInvoice],
			}).map(withoutParts),
		).toEqual([
			{
				type: "past_due_invoice_open",
				severity: "info",
				message: "Invoice INV-0002 for $20 is open; Stripe keeps retrying it.",
			},
		]);
	});

	test("an active subscription's open invoice isn't flagged", () => {
		expect(
			stateWarnings({
				billingContext: {
					currentEpochMs: NOON_UTC,
					billingCycleAnchorMs: "now",
					stripeSubscription: stripeSubscription({ status: "active" }),
				},
				stripeBillingPlan: {},
				liveOpenInvoices: [openInvoice],
			}),
		).toEqual([]);
	});
});
