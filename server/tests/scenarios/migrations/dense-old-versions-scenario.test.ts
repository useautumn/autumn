import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Migration setup: one old version with many customers, another old version
 * with a smaller group, and a latest version with no customers.
 *
 *   v1  100 messages              → cus migdense-v1-1..migdense-v1-6
 *   v2  250 messages + credits    → cus migdense-v2-1..migdense-v2-3
 *   v3  500 messages + credits + admin  (latest, no customer)
 */
test(`${chalk.yellowBright("migration-setup: dense old versions")}`, async () => {
	const team = products.base({
		id: "team",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const v1Customers = Array.from({ length: 6 }, (_, i) => `migdense-v1-${i + 1}`);
	const v2Customers = Array.from({ length: 3 }, (_, i) => `migdense-v2-${i + 1}`);

	const { autumnV1 } = await initScenario({
		customerId: v1Customers[0],
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [team], prefix: "migdense" }),
			s.otherCustomers(
				[...v1Customers.slice(1), ...v2Customers].map((id) => ({
					id,
					paymentMethod: "success",
				})),
			),
		],
		actions: [s.billing.attach({ productId: "team" })],
	});

	for (const customerId of v1Customers.slice(1)) {
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: team.id,
		});
	}

	await autumnV1.products.update(team.id, {
		items: [
			items.monthlyMessages({ includedUsage: 250 }),
			items.monthlyCredits({ includedUsage: 50 }),
		],
	});

	for (const customerId of v2Customers) {
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: team.id,
		});
	}

	await autumnV1.products.update(team.id, {
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyCredits({ includedUsage: 100 }),
			items.adminRights(),
		],
	});

	console.log(
		chalk.green(
			`[migration-setup] plan "${team.id}" has v1-v3. Six migdense-v1-* customers sit on v1; three migdense-v2-* customers sit on v2; latest is v3.`,
		),
	);
});
