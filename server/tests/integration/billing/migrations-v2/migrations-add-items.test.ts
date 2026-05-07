/**
 * Migrations V2 — add_items end-to-end (integration).
 *
 * Seeds 5 customers, parallel-attaches them all to a `free` product,
 * creates a migration adding the Dashboard feature, and triggers
 * `migrations.run`. Verifies the API call dispatches; downstream
 * trigger.dev side effects are out of scope here.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("migrations-v2 add-items: triggers run for 5 customers on free")}`, async () => {
	const customerId = "migration-run-add-items";
	const otherIds = [1, 2, 3, 4].map((i) => `${customerId}-c${i}`);
	const free = products.base({ id: "free", items: [], isDefault: true });

	const { autumnV1, autumnV2_2, customer, otherCustomers } = await initScenario(
		{
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free] }),
				s.otherCustomers(
					otherIds.map((id) => ({ id, paymentMethod: "success" as const })),
				),
			],
			actions: [],
		},
	);

	expect(customer).toBeTruthy();
	expect(otherCustomers.size).toBe(4);

	// Explicit parallel attach of all 5 customers to free. `free.id` was
	// mutated by initProductsV0 to include the prefix.
	const allCustomerIds = [customerId, ...otherIds];
	await Promise.all(
		allCustomerIds.map((id) =>
			autumnV1.attach({ customer_id: id, product_id: free.id }),
		),
	);

	await autumnV2_2.migrationsV2.deleteAndCreate({
		id: customerId,
		filter: { customer: { plan: { plan_id: free.id } } },
		operations: {
			customer: {
				update_plans: [
					{
						target: { plan_id: free.id },
						upsert_items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			},
		},
	});

	const runHandle = await autumnV2_2.migrationsV2.run({
		id: customerId,
		dry_run: false,
	});
	expect(runHandle.run_id).toBeTruthy();
	expect(runHandle.dry_run).toBe(false);
});
