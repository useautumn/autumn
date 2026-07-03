/**
 * dfu.flash — Stripe recurring plan applies mid-cycle usage (contract 1,2,3):
 * route resolves, a full v1 payload validates, and an active cusProduct is
 * inserted with balance = allowance - usage.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: Stripe recurring plan applies mid-cycle usage")}`,
	async () => {
		const customerId = "dfu-flash-stripe-recurring";
		const pro = products.pro({
			id: "dfu-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const { customerId: stripeCustomerId, subscriptionId } =
			await createRealStripeSub(ctx, { email: `${customerId}@example.com` });

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: pro.id,
									status: "active",
									balances: [{ feature_id: TestFeature.Messages, usage: 40 }],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 1: route resolves (not 404). Green now (stub 501) & post-impl (200). ──
		expect(flashRes.errorCode).not.toBe("not_found");
		expect(flashRes.errorMessage ?? "").not.toContain("status 404");

		// ── Contract 2: full v1 payload validates (no 400 / zod reject). ──
		expect(flashRes.errorCode).not.toBe("invalid_request");
		expect(flashRes.errorCode).not.toBe("invalid_inputs");

		// ── Contract 3: active cusProduct inserted; balance = allowance - usage. ──
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 60,
			usage: 40,
		});
	},
);
