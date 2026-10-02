/** A cancelled subscription rebuilt around a kept plan continues that plan's cycle, charging nothing before it. */

import { describe, expect, test } from "bun:test";
import {
	BillingVersion,
	type CreateScheduleBillingContext,
	ms,
	msToSeconds,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupKeptSubscriptionCycle } from "@/internal/billing/v2/actions/setPlans/setup/setupKeptSubscriptionCycle";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";

const ctx = contexts.create({});
const NOW = 1_800_000_000_000;
const PERIOD_END = NOW + ms.days(20);

const cancelledSubscription = ({ periodEndMs }: { periodEndMs: number }) =>
	({
		id: "sub_dead",
		status: "canceled",
		items: { data: [{ current_period_end: msToSeconds(periodEndMs) }] },
	}) as Stripe.Subscription;

const proRequestedAgain = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription?: Stripe.Subscription;
}): CreateScheduleBillingContext => {
	const pro = products.createFull({
		id: "pro",
		prices: [prices.createFixed({ id: "price_pro" })],
	});
	const customerProduct = customerProducts.create({
		id: "cus_prod_pro",
		productId: pro.id,
		product: pro,
		subscriptionIds: ["sub_dead"],
		customerPrices: [
			prices.createCustomer({
				price: pro.prices[0]!,
				customerProductId: "cus_prod_pro",
			}),
		],
	});
	const billingContext = contexts.createBilling({
		customerProducts: [customerProduct],
		fullProducts: [pro],
		currentEpochMs: NOW,
		billingVersion: BillingVersion.V2,
	});

	return {
		...billingContext,
		replacedStripeSubscription,
		productContexts: [
			{
				fullProduct: pro,
				customPrices: [],
				customEnts: [],
				featureQuantities: [],
				fullCustomer: billingContext.fullCustomer,
				currentCustomerProduct: customerProduct,
			},
		],
		checkoutMode: null,
		immediatePhase: { starts_at: NOW, plans: [{ plan_id: pro.id }] },
		futurePhases: [],
		scheduledPhaseContexts: [],
	};
};

const keptCycle = (billingContext: CreateScheduleBillingContext) =>
	setupKeptSubscriptionCycle({
		billingContext,
		timeline: setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: "end" },
		}),
	});

describe(chalk.yellowBright("setupKeptSubscriptionCycle"), () => {
	test("anchors the new subscription on the cancelled one's period end with no proration", () => {
		expect(
			keptCycle(
				proRequestedAgain({
					replacedStripeSubscription: cancelledSubscription({
						periodEndMs: PERIOD_END,
					}),
				}),
			),
		).toEqual({
			billingCycleAnchorMs: PERIOD_END,
			requestedProrationBehavior: "none",
		});
	});

	test("a live subscription keeps its own cycle", () => {
		expect(keptCycle(proRequestedAgain({}))).toEqual({});
	});

	test("a period that already ended starts a fresh cycle", () => {
		expect(
			keptCycle(
				proRequestedAgain({
					replacedStripeSubscription: cancelledSubscription({
						periodEndMs: NOW - ms.days(1),
					}),
				}),
			),
		).toEqual({});
	});
});

describe(chalk.yellowBright("setupKeptSubscriptionCycle: backdate"), () => {
	const BACKDATED_START = NOW - ms.days(40);
	const liveSubscription = {
		...cancelledSubscription({ periodEndMs: PERIOD_END }),
		status: "active",
	} as Stripe.Subscription;

	const backdatedOverLiveSubscription = ({
		planOnSubscription,
	}: {
		planOnSubscription: boolean;
	}): CreateScheduleBillingContext => {
		const billingContext = proRequestedAgain({
			replacedStripeSubscription: liveSubscription,
		});
		const [customerProduct] = billingContext.fullCustomer.customer_products;
		customerProduct!.subscription_ids = planOnSubscription
			? [liveSubscription.id]
			: [];
		return {
			...billingContext,
			subscriptionBackdateStartMs: BACKDATED_START,
			immediatePhase: {
				...billingContext.immediatePhase,
				starts_at: BACKDATED_START,
			},
		};
	};

	test("anchors on the live period end, leaving the requested proration to the plan change", () => {
		expect(
			setupKeptSubscriptionCycle({
				billingContext: backdatedOverLiveSubscription({
					planOnSubscription: true,
				}),
				timeline: setupSetPlansTimeline({
					ctx,
					billingContext: backdatedOverLiveSubscription({
						planOnSubscription: true,
					}),
					params: { undeclared_plans: "end" },
				}),
				requestedProrationBehavior: "prorate_immediately",
			}),
		).toEqual({
			billingCycleAnchorMs: PERIOD_END,
			requestedProrationBehavior: "prorate_immediately",
		});
	});

	test("anchors on the live period end even when no plan on it is kept", () => {
		expect(
			keptCycle(backdatedOverLiveSubscription({ planOnSubscription: false })),
		).toEqual({ billingCycleAnchorMs: PERIOD_END });
	});
});
