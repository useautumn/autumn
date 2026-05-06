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
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("migrations-v2 add-items: create migration on pro customers adding a feature item")}`,
	async () => {
		const customerId = "migrations-v2-add-items";

		const proMessages = items.monthlyMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const migrationId = `add-dashboard-to-pro-${Date.now()}`;

		const created = await autumnV2_2.migrationsV2.create({
			id: migrationId,
			filter: {
				customer: {
					plan: { plan_id: "pro" },
				},
			},
			operations: {
				customer: {
					update_plans: [
						{
							target: { plan_id: "pro" },
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

		expect(created.id).toBe(migrationId);
		expect(created.internal_id).toBeTruthy();
		expect(created.filter?.customer?.plan).toMatchObject({ plan_id: "pro" });
		expect(created.operations?.customer?.update_plans?.[0]).toMatchObject({
			target: { plan_id: "pro" },
			add_items: [{ feature_id: TestFeature.Dashboard }],
		});

		// Round-trip: list and confirm presence.
		const { list } = await autumnV2_2.migrationsV2.list();
		expect(list.some((m) => m.id === migrationId)).toBe(true);
	},
);
