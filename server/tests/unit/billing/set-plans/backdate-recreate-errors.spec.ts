/**
 * A backdate over a healthy live subscription recreates it, so anything the recreate would
 * lose or rebill is rejected with structured details: a trial, Stripe Checkout, a paid period
 * already over, a changed anchor, a start too far back, a plan it doesn't cover, or a schedule.
 */

import { describe, expect, test } from "bun:test";
import {
	addInterval,
	BillingInterval,
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullCusProduct,
	ms,
	msToSeconds,
	type SetPlansBackdateConflict,
	type SetPlansErrorDetails,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import type Stripe from "stripe";
import { handleFirstPhaseStartDateErrors } from "@/internal/billing/v2/actions/setPlans/errors/handleFirstPhaseStartDateErrors";
import { STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT } from "@/internal/billing/v2/utils/backdate/countBackdatedPeriods";

const NOW = Date.UTC(2026, 9, 2, 12);
const PERIOD_END = NOW + ms.days(12);
const BACKDATED_START = NOW - ms.days(40);

const pro = products.createFull({
	id: "pro",
	prices: [prices.createFixed({ id: "price_pro" })],
});

const rowOnLiveSubscription = ({
	id,
	startsAt = NOW - ms.days(18),
}: {
	id: string;
	startsAt?: number;
}): FullCusProduct =>
	customerProducts.create({
		id,
		productId: id,
		product: products.createFull({ id, name: `${id} plan` }),
		status: CusProductStatus.Active,
		subscriptionIds: ["sub_live"],
		startsAt,
	});

const liveSubscription = (
	status: Stripe.Subscription.Status = "active",
	periodEndMs: number | null = PERIOD_END,
) =>
	({
		id: "sub_live",
		status,
		items: {
			data:
				periodEndMs === null
					? []
					: [{ current_period_end: msToSeconds(periodEndMs) }],
		},
	}) as Stripe.Subscription;

const backdateContext = (
	overrides: Partial<CreateScheduleBillingContext> = {},
): CreateScheduleBillingContext =>
	({
		currentEpochMs: NOW,
		immediatePhase: { starts_at: BACKDATED_START, plans: [] },
		subscriptionBackdateStartMs: BACKDATED_START,
		replacedStripeSubscription: liveSubscription(),
		billingCycleAnchorMs: PERIOD_END,
		fullProducts: [pro],
		fullCustomer: {
			customer_products: [rowOnLiveSubscription({ id: "pro" })],
		},
		checkoutMode: null,
		...overrides,
	}) as unknown as CreateScheduleBillingContext;

const rejectionOf = ({
	billingContext,
	outOfScopeCustomerProductIds = [],
	preview = false,
}: {
	billingContext: CreateScheduleBillingContext;
	outOfScopeCustomerProductIds?: string[];
	preview?: boolean;
}): SetPlansErrorDetails | undefined => {
	try {
		handleFirstPhaseStartDateErrors({
			billingContext,
			timeline: { outOfScopeCustomerProductIds },
			preview,
		});
		return undefined;
	} catch (error) {
		return (
			(error as { details?: SetPlansErrorDetails }).details ??
			({
				type: "unstructured",
				message: (error as Error).message,
			} as unknown as SetPlansErrorDetails)
		);
	}
};

const conflict = (
	conflictType: SetPlansBackdateConflict,
	extra: { plan_name?: string; starts_at?: number } = {},
): SetPlansErrorDetails => ({
	type: "backdate_conflict",
	conflict: conflictType,
	starts_at: BACKDATED_START,
	...extra,
});

describe(
	chalk.yellowBright(
		"handleFirstPhaseStartDateErrors: backdate over a live subscription",
	),
	() => {
		test("a healthy subscription is recreated without complaint", () => {
			expect(
				rejectionOf({ billingContext: backdateContext() }),
			).toBeUndefined();
			expect(
				rejectionOf({
					billingContext: backdateContext({
						replacedStripeSubscription: liveSubscription("past_due"),
					}),
				}),
			).toBeUndefined();
		});

		test("a trial on the subscription, or a requested one, is rejected", () => {
			expect(
				rejectionOf({
					billingContext: backdateContext({
						replacedStripeSubscription: liveSubscription("trialing"),
					}),
				}),
			).toEqual(conflict("free_trial"));
			expect(
				rejectionOf({
					billingContext: backdateContext({
						trialContext: {
							trialEndsAt: NOW + ms.days(7),
							appliesToBilling: true,
							cardRequired: true,
						},
					}),
				}),
			).toEqual(conflict("free_trial"));
		});

		test("Stripe Checkout is rejected at execution, not in the preview", () => {
			const viaCheckout = backdateContext({ checkoutMode: "stripe_checkout" });
			expect(rejectionOf({ billingContext: viaCheckout })).toEqual(
				conflict("stripe_checkout"),
			);
			expect(
				rejectionOf({ billingContext: viaCheckout, preview: true }),
			).toBeUndefined();
		});

		test("an anchor off the live period end is rejected; the period end itself is fine", () => {
			expect(
				rejectionOf({
					billingContext: backdateContext({
						requestedBillingCycleAnchor: NOW + ms.days(3),
					}),
				}),
			).toEqual(conflict("billing_cycle_anchor"));
			expect(
				rejectionOf({
					billingContext: backdateContext({
						requestedBillingCycleAnchor: PERIOD_END,
					}),
				}),
			).toBeUndefined();
		});

		test("a start more than 250 invoice lines back is rejected", () => {
			const startsAt = addInterval({
				from: NOW,
				interval: BillingInterval.Month,
				intervalCount: -(STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT + 1),
			});
			expect(
				rejectionOf({
					billingContext: backdateContext({
						immediatePhase: { starts_at: startsAt, plans: [] },
						subscriptionBackdateStartMs: startsAt,
					}),
				}),
			).toEqual(conflict("too_far_back", { starts_at: startsAt }));
		});

		test("a past_due subscription whose paid period already ended is rejected", () => {
			expect(
				rejectionOf({
					billingContext: backdateContext({
						replacedStripeSubscription: liveSubscription(
							"past_due",
							NOW - ms.days(1),
						),
					}),
				}),
			).toEqual(conflict("period_ended"));
		});

		test("a subscription with no items has no paid period to continue, rather than a misread anchor", () => {
			expect(
				rejectionOf({
					billingContext: backdateContext({
						replacedStripeSubscription: liveSubscription("active", null),
						requestedBillingCycleAnchor: PERIOD_END,
					}),
				}),
			).toEqual(conflict("period_ended"));
		});

		test("a plan on the subscription the request doesn't cover is rejected", () => {
			const addOn = rowOnLiveSubscription({ id: "addon" });
			expect(
				rejectionOf({
					billingContext: backdateContext({
						fullCustomer: {
							customer_products: [rowOnLiveSubscription({ id: "pro" }), addOn],
						} as CreateScheduleBillingContext["fullCustomer"],
					}),
					outOfScopeCustomerProductIds: [addOn.id],
				}),
			).toEqual(conflict("plan_outside_request", { plan_name: "addon plan" }));
		});

		test("a schedule on the subscription can't be rebuilt behind an earlier start; replaying its own start passes", () => {
			const scheduled = {
				replacedStripeSubscription: undefined,
				subscriptionBackdateStartMs: undefined,
				stripeSubscription: liveSubscription(),
				stripeSubscriptionSchedule: {
					id: "sub_sched_live",
					subscription: "sub_live",
				} as Stripe.SubscriptionSchedule,
			};
			expect(
				rejectionOf({ billingContext: backdateContext(scheduled) }),
			).toEqual(conflict("subscription_schedule"));

			const replayedStart = NOW - ms.days(18);
			expect(
				rejectionOf({
					billingContext: backdateContext({
						...scheduled,
						immediatePhase: { starts_at: replayedStart, plans: [] },
					}),
				}),
			).toBeUndefined();
		});

		test("a replayed start between an older and a newer plan's start predates the newer plan", () => {
			const betweenStarts = NOW - ms.days(30);
			expect(
				rejectionOf({
					billingContext: backdateContext({
						replacedStripeSubscription: undefined,
						subscriptionBackdateStartMs: undefined,
						stripeSubscription: liveSubscription(),
						stripeSubscriptionSchedule: {
							id: "sub_sched_live",
							subscription: "sub_live",
						} as Stripe.SubscriptionSchedule,
						immediatePhase: { starts_at: betweenStarts, plans: [] },
						fullCustomer: {
							customer_products: [
								rowOnLiveSubscription({
									id: "pro",
									startsAt: NOW - ms.days(60),
								}),
								rowOnLiveSubscription({ id: "addon" }),
							],
						} as CreateScheduleBillingContext["fullCustomer"],
					}),
				}),
			).toEqual(
				conflict("subscription_schedule", { starts_at: betweenStarts }),
			);
		});
	},
);
