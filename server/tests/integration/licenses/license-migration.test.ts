/**
 * TDD test for plan-version migrations vs customized license sets.
 *
 * Red-failure mode (current behavior):
 *  - Migration only skips is_custom cusProducts. A customer with a customized
 *    license set (license_set_customized) is migrated onto a fresh cusProduct
 *    whose pools are rebuilt from the plan's inherited links — silently
 *    reverting their customization and re-parenting assignments over capacity.
 *
 * Green-success criteria (after fix):
 *  - Customized-license customers are excluded from migration (mirroring the
 *    is_custom exclusion); their custom pools and assignments stay intact.
 *  - Customers with inherited license sets still migrate, with assignments
 *    re-parented onto the new version's pools.
 */

import { expect, test } from "bun:test";
import type { LicenseBalanceResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const waitForMigration = (ms = 6000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

test.concurrent(
	`${chalk.yellowBright("licenses migration: customized license set is not reverted by version migration")}`,
	async () => {
		const parent = products.base({
			id: "lic-mig-custom-parent",
			items: [items.dashboard()],
		});
		const license = {
			...products.base({
				id: "lic-mig-custom-seat",
				items: [items.monthlyMessages({ includedUsage: 25 })],
			}),
		};

		const { customerId, entities, autumnV1, autumnV2_2 } = await initScenario({
			customerId: "lic-mig-customized",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				add_licenses: [
					{
						license_plan_id: license.id,
						included: 3,
					},
				],
			},
		});

		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entity.id,
				plan_id: license.id,
			});
		}

		const poolsBefore = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsBefore.list).toHaveLength(1);
		expect(poolsBefore.list[0].inventory).toMatchObject({
			included: 3,
			assigned: 2,
		});

		await autumnV1.products.update(parent.id, {
			items: [items.dashboard(), items.monthlyWords({ includedUsage: 100 })],
		});

		await autumnV1.migrate({
			from_product_id: parent.id,
			to_product_id: parent.id,
			from_version: 1,
			to_version: 2,
		});
		await waitForMigration();

		const migratedCustomer = await autumnV1.customers.get<{
			products: { id: string; version?: number }[];
		}>(customerId);
		// Customized license parents are deliberately skipped by migration —
		// the customer keeps v1 with its customization intact.
		const parentVersions = migratedCustomer.products
			.filter((product) => product.id === parent.id)
			.map((product) => product.version);
		expect(parentVersions).toContain(1);
		expect(parentVersions).not.toContain(2);

		const poolsAfter = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfter.list).toHaveLength(1);
		expect(poolsAfter.list[0].inventory).toMatchObject({
			included: 3,
			assigned: 2,
		});
	},
);
