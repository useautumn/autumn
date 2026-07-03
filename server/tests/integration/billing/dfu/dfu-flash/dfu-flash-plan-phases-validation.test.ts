/**
 * dfu.flash — `plan`/`phases` validator: a billable must carry exactly one of
 * `plan` or `phases`. BOTH present is rejected; NEITHER present is rejected.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ── Validator: BOTH `plan` and `phases` present is rejected (400) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: billable with BOTH plan and phases is rejected")}`,
	async () => {
		const customerId = "dfu-flash-both";
		const pro = products.pro({
			id: "dfu-both-pro",
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
					plan: { plan_id: pro.id, status: "active" },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// Rejected as a validation error; flash never runs.
		expect(flashRes.errorCode).toBe("invalid_inputs");
		expect(flashRes.errorMessage ?? "").toContain("not both");
		expect(flashRes.result).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, notPresent: [pro.id] });
	},
);

// ── Validator: NEITHER `plan` nor `phases` present is rejected (400) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: billable with NEITHER plan nor phases is rejected")}`,
	async () => {
		const customerId = "dfu-flash-neither";
		const pro = products.pro({
			id: "dfu-neither-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
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
				{ processor: "stripe", link: { subscription_id: subscriptionId } },
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		expect(flashRes.errorCode).toBe("invalid_inputs");
		expect(flashRes.errorMessage ?? "").toContain("`plan` or `phases`");
		expect(flashRes.result).toBeNull();
	},
);
