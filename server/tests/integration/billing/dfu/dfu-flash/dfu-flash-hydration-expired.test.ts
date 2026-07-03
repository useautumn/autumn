/**
 * dfu.flash hydration — a canceled sub with no future period resolves to Expired
 * (leak guard): status=Expired and no feature access.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, CusProductStatus } from "@autumn/shared";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils.js";
import {
	type FlashClient,
	callFlash,
	getFlashedCustomerProduct,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: hydrated canceled sub with no future end is Expired (no access)")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-expired";
		const pro = products.pro({
			id: "dfu-hydrate-expired-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const sub = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		await ctx.stripeCli.subscriptions.cancel(sub.id);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Expired);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(0);
	},
);
