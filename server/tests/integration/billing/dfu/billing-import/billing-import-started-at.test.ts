/**
 * dfu.flash — plan.started_at records the plan's real start date. Without a linked
 * sub to hydrate (a one-off), the plan would otherwise start at the import time.
 */

import { expect, test } from "bun:test";
import {
	type FlashClient,
	THIRTY_DAYS_MS,
	callFlash,
	createRealStripeCustomer,
	getFlashedCustomerProduct,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: plan.started_at sets the imported one-off start date")}`,
	async () => {
		const customerId = "dfu-flash-starts-at";
		const pro = products.oneOff({
			id: "dfu-starts-at-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const stripeCustomerId = await createRealStripeCustomer(ctx, {
			email: `${customerId}@example.com`,
		});

		// A real purchase date months in the past — distinct from the import time.
		const startsAt = Date.now() - THIRTY_DAYS_MS * 4;

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					plan: {
						plan_id: pro.id,
						status: "active",
						started_at: startsAt,
						balances: [{ feature_id: TestFeature.Messages, usage: 10 }],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorCode).not.toBe("invalid_inputs");
		expect(flashRes.errorCode).not.toBe("invalid_request");

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.starts_at).toBe(startsAt);
		// created_at is back-dated to the real start too, not the import time.
		expect(cusProduct?.created_at).toBe(startsAt);
	},
);

test.concurrent(
	`${chalk.yellowBright("dfu.flash: resetting plan with no started_at is flagged, not blocked")}`,
	async () => {
		const customerId = "dfu-flash-started-at-required";
		// Free (no base price) so this isolates the anchor mismatch, not the
		// paid-plan-without-subscription one.
		const pro = products.base({
			id: "dfu-started-at-required-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const stripeCustomerId = await createRealStripeCustomer(ctx, {
			email: `${customerId}@example.com`,
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			// One-off (no link) + resetting credits + no started_at → imaged but flagged.
			billables: [
				{ processor: "stripe", plan: { plan_id: pro.id, status: "active" } },
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		// Not blocked — the plan is imaged but flagged so the caller sees the state is wrong.
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.customer_product_id).toBeTruthy();
		expect(flashed?.mismatch).toBe(true);
		expect(flashed?.reason).toBe("no_resolvable_billing_anchor");
	},
);
