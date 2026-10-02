/**
 * A backdate over a live subscription is rejected, before anything is written, when recreating
 * it would lose or rebill something: a trial on it, Stripe Checkout, a start past Stripe's
 * 250-line backdate limit, or another entity's plan on it the request doesn't cover.
 */

import { expect, test } from "bun:test";
import {
	addInterval,
	BillingInterval,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { liveSubscriptionPeriod } from "./utils/backdateLiveUtils";

const BEYOND_STRIPE_BACKDATE_LIMIT_MONTHS = 251;

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a trialing subscription is rejected and left untouched")}`,
	async () => {
		const proWithTrial = products.proWithTrial({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-backdate-live-trial",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proWithTrial] }),
			],
			actions: [
				s.billing.attach({ productId: proWithTrial.id }),
				s.advanceTestClock({ days: 2 }),
			],
		});
		const trialing = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "trialing",
		});

		await expectAutumnError({
			errMessage: "A trial can't be backdated to",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					phases: [
						{
							starts_at: trialing.start_date * 1000 - ms.days(10),
							plans: [{ plan_id: proWithTrial.id }],
						},
					],
				}),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(trialing.id)).status,
		).toBe("trialing");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: Stripe Checkout and a start past the 250-line limit are rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-backdate-live-checkout-limit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });

		await expectAutumnError({
			errMessage: "Stripe Checkout can't backdate the subscription to",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					redirect_mode: "always",
					phases: [
						{
							starts_at: live.startMs - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		await expectAutumnError({
			errMessage: "Stripe can't backdate the subscription this far",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					phases: [
						{
							starts_at: addInterval({
								from: advancedTo,
								interval: BillingInterval.Month,
								intervalCount: -BEYOND_STRIPE_BACKDATE_LIMIT_MONTHS,
							}),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(live.subscription.id)).status,
		).toBe("active");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: an entity request is rejected while another entity's plan shares the subscription")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, entities } = await initScenario({
			customerId: "set-plans-backdate-live-other-entity",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceTestClock({ days: 10 }),
			],
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });

		await expectAutumnError({
			errMessage: "is on the subscription but not in this request",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					entity_id: entities[0]!.id,
					phases: [
						{
							starts_at: live.startMs - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(live.subscription.id)).status,
		).toBe("active");
	},
);
