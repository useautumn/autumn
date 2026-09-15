/**
 * A plan gains a license after customers are already on it; the auto-drafted
 * update_plan migration carries the link via upsert_licenses. The per-customer
 * lane goes through the billing.update patch path, which must mint the pool.
 *
 * Red (current):  run succeeds, customer still has no pool, licenses.attach 400s.
 * Green (after):  one pool per matched customer with granted = included.
 */
import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import {
	getLicenseDbState,
	listLicensePools,
} from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const INCLUDED_SEATS = 3;

test(`${chalk.yellowBright("migration-license: upsert_licenses mints a pool for customers already on the plan")}`, async () => {
	const customerId = "mig-license-new-pool";
	const idPrefix = "mig-license-new-pool";
	const parent = products.base({
		id: `${idPrefix}-parent`,
		items: [items.dashboard()],
	});
	const license = products.base({
		id: `${idPrefix}-seat`,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

	const { ctx, autumnV2_2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});

	const before = await getLicenseDbState({ db: ctx.db, customerId });
	expect(before.pools).toHaveLength(0);

	// Catalog gains the link after the customer attached; the migration is
	// what the dashboard auto-drafts for that edit.
	await autumnV2_2.post("/plans.update", {
		plan_id: parent.id,
		licenses: [{ license_plan_id: license.id, included: INCLUDED_SEATS }],
		migration: { draft: false },
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${idPrefix}-migration`,
		filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: parent.id, custom: false },
					customize: {
						upsert_licenses: [
							{ license_plan_id: license.id, included: INCLUDED_SEATS },
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});
	expect(result?.lane).toBe("per_customer");

	const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
	expect(pools).toHaveLength(1);
	expect(pools[0]).toMatchObject({
		license_plan_id: license.id,
		granted: INCLUDED_SEATS,
		usage: 0,
		remaining: INCLUDED_SEATS,
	});

	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		plan_id: license.id,
		entities: [{ entity_id: entities[0].id }],
	});
	const after = await getLicenseDbState({ db: ctx.db, customerId });
	expect(after.pools).toHaveLength(1);
	expect(after.pools[0]).toMatchObject({
		granted: INCLUDED_SEATS,
		remaining: INCLUDED_SEATS - 1,
	});
});
