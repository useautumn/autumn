/**
 * dfu.flash — `plan` shorthand: a singular `plan` on a billable is normalized to
 * phases:[{ starts_at:"now", plans:[plan] }] and imports the same cusProduct.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: `plan` shorthand imports same cusProduct as phases form")}`,
	async () => {
		const customerId = "dfu-flash-plan-shorthand";
		const pro = products.pro({
			id: "dfu-plan-shorthand-pro",
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
					// Singular `plan` — normalized to phases:[{ starts_at:"now", plans:[plan] }].
					plan: {
						plan_id: pro.id,
						status: "active",
						balances: [{ feature_id: TestFeature.Messages, usage: 40 }],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorCode).not.toBe("invalid_inputs");
		expect(flashRes.errorCode).not.toBe("invalid_request");

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
