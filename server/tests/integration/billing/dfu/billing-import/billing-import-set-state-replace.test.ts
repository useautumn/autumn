/**
 * dfu.flash — set-state replace: re-flashing the SAME customer with a different
 * plan expires the old customer-level plan (recoverable) and activates the new.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	callFlash,
	createRealStripeSub,
	type FlashClient,
	getFlashedCustomerProduct,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: re-flashing a different plan expires the old one")}`,
	async () => {
		const customerId = "dfu-flash-set-state-replace";
		const planA = products.pro({
			id: "dfu-replace-plan-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planB = products.premium({
			id: "dfu-replace-plan-b",
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

		const subA = await createRealStripeSub(ctx, {
			email: `${customerId}-a@example.com`,
		});
		const subB = await createRealStripeSub(ctx, {
			email: `${customerId}-b@example.com`,
		});

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
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: planId, status: "active" }],
						},
					],
				},
			],
		});

		await callFlash(
			autumnV2_2 as FlashClient,
			buildPayload(planA.id, subA.customerId, subA.subscriptionId),
		);
		const secondFlash = await callFlash(
			autumnV2_2 as FlashClient,
			buildPayload(planB.id, subB.customerId, subB.subscriptionId),
		);

		// ── Plan A is reported expired (recoverable), plan B inserted active. ──
		const expiredA = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === planA.id,
		);
		expect(expiredA?.expired).toBe(true);
		expect(expiredA?.status).toBe(CusProductStatus.Expired);
		expect(expiredA?.reason).toBe("expired_not_in_desired_state");

		const insertedB = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === planB.id,
		);
		expect(insertedB?.skipped).toBe(false);
		expect(insertedB?.expired).toBeUndefined();

		// ── A is expired-not-deleted (still queryable); B is active. ──
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
	},
);
