import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";

test.concurrent(
	`${chalk.yellowBright("billing-verify baseline: in-sync subscription reports status=correct with no mismatches")}`,
	async () => {
		const customerId = "verify-baseline";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.customer_id).toBe(customerId);
		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("correct");
		expect(result.subscriptions[0].mismatches).toEqual([]);
	},
);
