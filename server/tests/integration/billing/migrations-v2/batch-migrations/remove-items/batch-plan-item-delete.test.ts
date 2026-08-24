/**
 * Deleting a free item from a plain plan should batch-lower, the same as
 * adding one.
 *
 * A standalone remove_items was rejected op-level as unsupported_remove_items,
 * and the projected diff never carried deletions, so it fell to the
 * per-customer lane.
 *
 * Red-failure mode (before):
 *  - the op is rejected as unsupported_remove_items and runs per_customer
 *
 * Green-success criteria (after):
 *  - the op runs on the batch lane
 *  - the customer loses its row for the removed feature
 *  - the plan's other items survive
 *  - a customer whose only change was the delete is not reported as skipped
 */
import { expect, test } from "bun:test";
import { MigrationItemRunStatus, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";

const MESSAGES_INCLUDED = 100;

test(`${chalk.yellowBright("batch plan-item delete: deleting a free plan item batch-lowers and drops the rows")}`, async () => {
	const customerId = "bpid-delete-plain-customer";
	const plan = products.base({
		id: "bpid-delete-plain-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 1,
	});

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_3,
		migrationId: "bpid-delete-plain-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [
							{
								feature_id: TestFeature.Messages,
								interval: ResetInterval.Month,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	// The delete is the only change, so marking the customer skipped would
	// skip its cache invalidation.
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
	});

	await pollUntil({
		fetch: async () => {
			const customer = await autumnV2_3.customers.get(customerId);
			return customer;
		},
		until: (customer) => !customer.features?.[TestFeature.Messages],
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 0,
	});

	// ── The plan's other item survives ────────────────────────────────
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Dashboard,
		count: 1,
	});
});
