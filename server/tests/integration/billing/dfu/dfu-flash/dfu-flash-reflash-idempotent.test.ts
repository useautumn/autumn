/**
 * dfu.flash — re-flash idempotency (contract 7): re-flashing the same payload
 * skips the existing active cusProduct and duplicates nothing.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: re-flashing skips existing active cusProducts")}`,
	async () => {
		const customerId = "dfu-flash-reflash";
		const pro = products.pro({
			id: "dfu-reflash-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
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
									balances: [{ feature_id: TestFeature.Messages, usage: 25 }],
								},
							],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);
		const secondFlash = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 7a: second flash reports the existing product as skipped. ──
		const flashed = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === pro.id,
		);
		expect(flashed?.skipped).toBe(true);

		// ── Contract 7b: nothing duplicated — single active product remains. ──
		const customerV5 = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer: customerV5, active: [pro.id] });
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const proInstances = (customerV3.products ?? []).filter(
			(p) => p.id === pro.id,
		);
		expect(proInstances.length).toBe(1);
	},
);
