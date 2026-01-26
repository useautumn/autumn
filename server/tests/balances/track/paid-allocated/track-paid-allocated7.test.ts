import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Tests distributed lock preventing race conditions on paid-allocated features.
 *
 * The lock ensures that concurrent track requests for paid-allocated features
 * (which may trigger billing operations) are serialized to prevent race conditions.
 */

test(
	`${chalk.yellowBright("paid-allocated-lock: concurrent track requests are serialized by distributed lock")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const uniqueId = `paid-alloc-lock`;
		const { customerId, autumnV2 } = await initScenario({
			customerId: uniqueId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Verify initial balance
		const customerBefore = (await autumnV2.customers.get(
			customerId,
		)) as ApiCustomer;
		expect(customerBefore.balances[TestFeature.Users].current_balance).toBe(0);

		// 1. Send concurrent requests - lock should serialize them
		console.log("🚀 Starting 5 concurrent track calls (2 users each)...");

		const promises = Array(5)
			.fill(null)
			.map(() =>
				autumnV2.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 2,
				}),
			);

		const results = await Promise.allSettled(promises);
		const successCount = results.filter((r) => r.status === "fulfilled").length;
		const rejectedCount = results.filter((r) => r.status === "rejected").length;

		console.log(
			`✅ Successful: ${successCount}, ❌ Rejected (lock): ${rejectedCount}`,
		);

		// At least one should succeed
		expect(successCount).toEqual(1);

		// 2. Verify balance is mathematically correct
		await timeout(2000);
		const customerAfter = (await autumnV2.customers.get(
			customerId,
		)) as ApiCustomer;
		const balance = customerAfter.balances[TestFeature.Users];

		const expectedUsage = successCount * 2;
		expect(balance.usage).toBe(expectedUsage);
		expect(balance.granted_balance).toBe(0);

		expect(customerAfter.invoices?.length).toBe(2);

		// Balance equation: granted + purchased - usage = current
		const expectedCurrentBalance =
			balance.granted_balance + balance.purchased_balance - balance.usage;
		expect(balance.current_balance).toBe(expectedCurrentBalance);

		// 3. Sequential track after concurrent burst should work
		console.log("📊 Executing sequential track after burst...");
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});

		const customerFinal = (await autumnV2.customers.get(
			customerId,
		)) as ApiCustomer;
		expect(customerFinal.balances[TestFeature.Users].usage).toBe(
			expectedUsage + 1,
		);

		// 4. Verify DB consistency
		await new Promise((r) => setTimeout(r, 3000));

		const dbCustomer = (await autumnV2.customers.get(customerId, {
			skip_cache: "true",
		})) as ApiCustomer;

		expect(dbCustomer.balances[TestFeature.Users].usage).toBe(
			expectedUsage + 1,
		);

		await timeout(2000);
		expect(dbCustomer.invoices?.length).toBe(3);
	},
	{ timeout: 60000 },
);
