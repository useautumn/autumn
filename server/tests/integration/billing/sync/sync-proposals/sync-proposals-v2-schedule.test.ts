/**
 * Red: scheduled subscriptions with no auto-matched Autumn plans expose one fallback phase.
 * Green: proposals preserve every Stripe schedule phase so the dashboard can attach plans.
 */

import { expect, test } from "bun:test";
import type { SyncProposalsV2Response } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createStripeSubscriptionSchedule,
	getStripeCustomerId,
} from "../utils/syncProductHelpers";

test.concurrent(
	`${chalk.yellowBright("sync-proposals-v2: scheduled subscription preserves unmatched phases")}`,
	async () => {
		const customerId = "sync-proposals-v2-schedule-unmatched";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });
		const externalProduct = await ctx.stripeCli.products.create({
			name: "External scheduled product",
		});
		const phase1Price = await ctx.stripeCli.prices.create({
			product: externalProduct.id,
			unit_amount: 7500,
			currency: "usd",
			recurring: { interval: "month" },
		});
		const phase2Price = await ctx.stripeCli.prices.create({
			product: externalProduct.id,
			unit_amount: 10500,
			currency: "usd",
			recurring: { interval: "month" },
		});

		const { subscription, schedule } = await createStripeSubscriptionSchedule({
			ctx,
			customerId,
			phases: [
				{ items: [{ price: phase1Price.id }] },
				{ items: [{ price: phase2Price.id }] },
			],
		});
		expect(subscription.customer).toBe(stripeCustomerId);

		const proposalsResponse: SyncProposalsV2Response = await autumnV1.post(
			"/billing.sync_proposals_v2",
			{ customer_id: customerId },
		);

		const proposal = proposalsResponse.proposals.find(
			(p) => p.stripe_subscription_id === subscription.id,
		);
		expect(proposal).toBeDefined();
		expect(proposal?.stripe_schedule_id).toBe(schedule.id);
		expect(proposal?.stripe_schedule?.id).toBe(schedule.id);
		expect(proposal?.phases).toHaveLength(2);
		expect(proposal?.phases[0]?.starts_at).toBe("now");
		expect(proposal?.phases[0]?.plans).toHaveLength(0);
		expect(proposal?.phases[1]?.starts_at).toBe(
			schedule.phases[1].start_date * 1000,
		);
		expect(proposal?.phases[1]?.plans).toHaveLength(0);
	},
);
