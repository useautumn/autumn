/**
 * Migrations V2 — add_items
 *
 * Phase 1 acceptance: a user can create a migration definition whose
 * filter selects customers on a given plan and whose operation adds a
 * plan item to their matching cusproducts.
 *
 * This test only verifies the CREATE path (storing the migration
 * definition end-to-end). Execution / preview is phase 2+.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("migrations-v2 add-items: create migration on free customers adding a feature item")}`,
	async () => {
		const customerId = "migrations-v2-add-items";

		// Default free product so the seeded customer auto-attaches to it.
		const free = products.base({ id: "free", items: [], isDefault: true });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free] }),
			],
		});

		// migrationId reuses the suffixed customerId so it's unique per concurrent
		// test run without needing a Date.now() hack.
		const created = await autumnV2_2.migrationsV2.create({
			id: customerId,
			filter: {
				customer: {
					plan: { plan_id: free.id },
				},
			},
			operations: {
				customer: {
					update_plans: [
						{
							target: { plan_id: free.id },
							add_items: [
								{
									feature_id: TestFeature.Dashboard,
								},
							],
						},
					],
				},
			},
		});

		expect(created.id).toBe(customerId);
		expect(created.internal_id).toBeTruthy();
		expect(created.filter?.customer?.plan).toMatchObject({ plan_id: free.id });
		expect(created.operations?.customer?.update_plans?.[0]).toMatchObject({
			target: { plan_id: free.id },
			add_items: [{ feature_id: TestFeature.Dashboard }],
		});

		// Round-trip: list and confirm presence.
		const { list } = await autumnV2_2.migrationsV2.list();
		expect(list.some((m) => m.id === customerId)).toBe(true);
	},
);
