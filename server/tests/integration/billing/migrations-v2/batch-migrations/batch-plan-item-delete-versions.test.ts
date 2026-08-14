/**
 * A version-less remove_items must reach customers on every version of the
 * plan, not just the latest.
 *
 * Entitlement ids are minted fresh per version, and the executor deletes by
 * id — so this only works because the catalog load enumerates all versions
 * (shouldRunBatchLane passes returnAll). Narrowing that to latest-only would
 * silently no-op every older-version customer, which this test would catch.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../utils/runChunkedMigration";
import { expectCustomerEntitlementRowCount } from "./batchTestUtils";

const MESSAGES_INCLUDED = 100;

test(`${chalk.yellowBright("batch migration: a version-less delete reaches every plan version")}`, async () => {
	const v1CustomerId = "batch-delete-versions-v1";
	const v2CustomerId = "batch-delete-versions-v2";
	const plan = products.base({
		id: "batch-delete-versions-plan",
		items: [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV1, autumnV2_2 } = await initScenario({
		customerId: v1CustomerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	// v2 keeps both items; only the version number moves, so the v2 customer
	// holds a different entitlement id for the same feature.
	await autumnV1.products.update(plan.id, {
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	await autumnV1.customers.create({ id: v2CustomerId });
	await autumnV2_2.billing.attach({
		customer_id: v2CustomerId,
		plan_id: plan.id,
	});

	for (const customerId of [v1CustomerId, v2CustomerId]) {
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
	}

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-versions-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	for (const customerId of [v1CustomerId, v2CustomerId]) {
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 0,
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Dashboard,
			count: 1,
		});
	}
});
