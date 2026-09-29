/**
 * set_plans never updates a subscription Stripe won't collect on (incomplete, paused).
 * It cancels that subscription and puts the plans on one new subscription (Q1, Q11).
 * Unpaid invoices on the old subscription are left open (Q8).
 *
 * Red (before):  a second subscription was created beside the incomplete one, and the
 *                paused one was updated in place.
 * Green (after): the old subscription is cancelled and exactly one new one is live.
 *                Stripe reports a cancelled incomplete subscription as incomplete_expired.
 */

import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	expectSubscriptionReplaced,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: incomplete subscription from a declined card is cancelled and replaced")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-incomplete-declined",
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "success" }),
			],
		});

		const incomplete = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "incomplete",
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: incomplete.id,
			replacedStatus: "incomplete_expired",
		});
		const { data: invoices } = await ctx.stripeCli.invoices.list({
			subscription: incomplete.id,
		});
		expect(invoices.map((invoice) => invoice.status)).toEqual(["void"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: paused subscription is cancelled and replaced")}`,
	async () => {
		const trialDays = 3;
		const pro = products.baseWithTrial({
			id: "pro",
			items: [items.monthlyPrice({ price: 20 })],
			trialDays,
			cardRequired: false,
		});

		const { customerId, autumnV2_4, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "set-plans-paused",
				setup: [s.customer({}), s.products({ list: [pro] })],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const trialing = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "trialing",
		});
		await ctx.stripeCli.subscriptions.update(trialing.id, {
			trial_settings: { end_behavior: { missing_payment_method: "pause" } },
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: advancedTo + ms.days(trialDays + 1),
			waitForSeconds: 30,
		});
		const paused = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
		expect(paused.status).toBe("paused");

		await attachPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCusId: paused.customer as string,
			type: "success",
		});
		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: paused.id,
		});
	},
);
