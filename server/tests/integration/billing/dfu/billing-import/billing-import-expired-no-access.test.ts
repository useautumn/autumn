import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: expired plan is status=expired and grants no access")}`,
	async () => {
		const customerId = "dfu-flash-expired";
		const pro = products.pro({
			id: "dfu-expired-pro",
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
					plan: { plan_id: pro.id, status: "expired" },
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.status).toBe("expired");

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, notPresent: [pro.id] });
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(0);
	},
);
