/**
 * A customer with a scheduled parent change must still receive the migration on
 * the parent they are billing on today.
 *
 * The canonical pool LATERAL ranks candidate pools by
 * `pool_parent.status IN MIGRATABLE_STATUSES`, and that set contains Scheduled —
 * so an active parent and its scheduled successor score identically and the
 * created_at tie-break picks the successor. The operation scope then filters on
 * the wrong parent product and the assignment matches nothing.
 *
 * Red: the migration reports success having touched no assignment.
 * Green: the live parent's assignments gain the item.
 */
import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import {
	ITEM_TRANSITION_ENTITY_COUNT,
	setupItemTransitionScenario,
} from "@tests/integration/licenses/billing/transitions/utils/itemTransitionTestUtils";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const FROM_WORKFLOWS = 500;
const TO_WORKFLOWS = 100;

test(`${chalk.yellowBright("batch-license-customize: a scheduled parent change does not strand the live seats")}`, async () => {
	const scenario = await setupItemTransitionScenario({
		idPrefix: "batch-sched-parent",
		fromItems: [
			items.freeAllocatedWorkflows({ includedUsage: FROM_WORKFLOWS }),
		],
		toItems: [items.freeAllocatedWorkflows({ includedUsage: TO_WORKFLOWS })],
		trackedFeatureIds: [TestFeature.Workflows],
		fromParentPrice: 20,
	});

	const { ctx, autumnV2_2, autumnV2_3, customerId, fromParent, toParent } =
		scenario;

	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments.length).toBe(ITEM_TRANSITION_ENTITY_COUNT);
	const assignmentIds = liveAssignments.map((assignment) => assignment.id);

	// Schedules toParent for period end, leaving fromParent active and its
	// successor Scheduled — both inside MIGRATABLE_STATUSES.
	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: toParent.id,
		redirect_mode: "if_required",
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-sched-parent-mig",
		filter: { customer: { plan: { plan_id: fromParent.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: fromParent.id, custom: false },
					customize: {
						upsert_licenses: [
							{
								license_plan_id: scenario.fromSeat.id,
								customize: {
									add_items: [{ feature_id: TestFeature.Dashboard }],
								},
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	const readDashboardRows = async () => {
		const rows = await ctx.db
			.select({ featureId: customerEntitlements.feature_id })
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
		return rows.filter((row) => row.featureId === TestFeature.Dashboard);
	};

	const converged = await pollUntil({
		fetch: readDashboardRows,
		until: (rows) => rows.length === ITEM_TRANSITION_ENTITY_COUNT,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	expect(converged).toHaveLength(ITEM_TRANSITION_ENTITY_COUNT);
});
