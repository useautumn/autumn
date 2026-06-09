import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Migration setup: free plan with feature-only versions (no billing changes).
 *
 *   v1  100 messages                        → cus migfree-v1
 *   v2  200 messages                        → cus migfree-v2
 *   v3  200 messages + 50 credits           → cus migfree-v3
 *   v4  500 messages + 100 credits + admin  (latest, no customer)
 *
 * All changes are entitlement-only, so migrations here exercise the
 * no-billing-changes (DB-only) path.
 */
test(`${chalk.yellowBright("migration-setup: free plan multi-version (no billing)")}`, async () => {
	const free = products.base({
		id: "starter",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId: "migfree-v1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free], prefix: "migfree" }),
			s.otherCustomers([
				{ id: "migfree-v2", paymentMethod: "success" },
				{ id: "migfree-v3", paymentMethod: "success" },
			]),
		],
		actions: [s.billing.attach({ productId: "starter" })],
	});

	await autumnV1.products.update(free.id, {
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});
	await autumnV1.billing.attach({ customer_id: "migfree-v2", product_id: free.id });

	await autumnV1.products.update(free.id, {
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyCredits({ includedUsage: 50 }),
		],
	});
	await autumnV1.billing.attach({ customer_id: "migfree-v3", product_id: free.id });

	await autumnV1.products.update(free.id, {
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyCredits({ includedUsage: 100 }),
			items.adminRights(),
		],
	});

	console.log(
		chalk.green(
			`[migration-setup] plan "${free.id}" has v1-v4. Customers migfree-v1..migfree-v3 sit on v1..v3; latest is v4.`,
		),
	);
});
