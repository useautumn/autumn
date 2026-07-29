/**
 * dfu.flash (test clock) — set-state replace mid-cycle: flash plan A on a
 * mid-cycle sub, then re-import plan B on a second mid-cycle sub. A must expire
 * (recoverable) and B activate with B's own real mid-cycle anchor.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	advanceClock,
	callFlash,
	createRealStripeCustomerOnClock,
	createRealStripeSubOnClock,
	type FlashClient,
	getFlashedCustomerProduct,
	THIRTY_DAYS_MS,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash clock: replacing plan A with plan B keeps B's own mid-cycle anchor")}`,
	async () => {
		const customerId = "dfu-flash-clock-set-state-replace";
		const planA = products.pro({
			id: "dfu-clock-replace-plan-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planB = products.premium({
			id: "dfu-clock-replace-plan-b",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [],
		});

		const day = THIRTY_DAYS_MS / 30;
		const setupSub = async (label: string, daysBack: number) => {
			const { customerId: stripeCustomerId, testClockId } =
				await createRealStripeCustomerOnClock(ctx, {
					email: `${customerId}-${label}@example.com`,
					frozenTime: Date.now() - day * daysBack,
				});
			const { subscriptionId } = await createRealStripeSubOnClock(ctx, {
				customerId: stripeCustomerId,
				label: `${customerId}-${label}`,
			});
			await advanceClock(ctx, { testClockId, advanceTo: Date.now() });
			return { stripeCustomerId, subscriptionId };
		};

		const subA = await setupSub("a", 15);
		const subB = await setupSub("b", 10);

		const bSub = await ctx.stripeCli.subscriptions.retrieve(
			subB.subscriptionId,
		);
		const bPeriodEndMs = bSub.items.data[0].current_period_end * 1000;
		console.log("replace subB", {
			status: bSub.status,
			periodEnd: new Date(bPeriodEndMs).toISOString(),
			now: new Date().toISOString(),
		});
		expect(bPeriodEndMs).toBeGreaterThan(Date.now());

		const buildPayload = (
			planId: string,
			stripeCustomerId: string,
			subscriptionId: string,
		) => ({
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subscriptionId },
					phases: [{ starts_at: "now", plans: [{ plan_id: planId }] }],
				},
			],
		});

		await callFlash(
			autumnV2_2 as FlashClient,
			buildPayload(planA.id, subA.stripeCustomerId, subA.subscriptionId),
		);
		const secondFlash = await callFlash(
			autumnV2_2 as FlashClient,
			buildPayload(planB.id, subB.stripeCustomerId, subB.subscriptionId),
		);

		const expiredA = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === planA.id,
		);
		expect(expiredA?.expired).toBe(true);
		expect(expiredA?.reason).toBe("expired_not_in_desired_state");

		// A is expired but still queryable (recoverable), B is active.
		const productA = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planA.id,
		});
		expect(productA?.status).toBe(CusProductStatus.Expired);

		const productB = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planB.id,
		});
		expect(productB?.status).toBe(CusProductStatus.Active);
		// B keeps its own real mid-cycle anchor, not import + 1 month.
		expect(productB?.billing_cycle_anchor).toBe(bPeriodEndMs);

		const messagesEnt = productB?.customer_entitlements.find(
			(ent) => ent.feature_id === TestFeature.Messages,
		);
		expect(messagesEnt?.next_reset_at).toBe(bPeriodEndMs);
	},
);
