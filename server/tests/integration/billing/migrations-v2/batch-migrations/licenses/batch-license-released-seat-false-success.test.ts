/**
 * A run that grants nothing must not report the customer as succeeded.
 *
 * insertLicenseCustomerEntitlementRows re-asserts assignment state at insert
 * time (customer_license_link_id / internal_entity_id NOT NULL, status in
 * MIGRATABLE_STATUSES), so released seats yield no inserted rows. Nothing
 * records that drop: excludedInternalCustomerIds only ever carries
 * cycle-enrichment refusals, and enrichCustomerEntitlementCycles returns a
 * hardcoded empty list, so the field is structurally dead on this lane.
 *
 * executeBatchMigrationPage then unions insertedItems with repointedIds, and
 * the whole-page pool repoint fires regardless of whether any assignment row
 * was written. The customer is marked succeeded with zero entitlement rows —
 * the migration claims the item was granted to seats that do not exist.
 * candidateCount and affected would expose the mismatch but are consumed only
 * by a debug log.
 *
 * Red: the customer is marked succeeded while holding no row for the feature.
 * Green: success requires a row actually written.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, migrationItemRuns } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const ADDED_MESSAGES = 250;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: a run granting nothing is not reported as succeeded")}`, async () => {
	const customerId = "batch-released-seat-customer";
	const idPrefix = "batch-released-seat";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.dashboard()],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, autumnV2_3, parent, devSeat } = scenario;

	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments.length).toBe(ASSIGNED_SEATS);

	await autumnV2_3.licenses.release({
		customer_id: customerId,
		license_plan_id: devSeat.id,
		entity_ids: [`${idPrefix}-entity-1`, `${idPrefix}-entity-2`],
	});

	const { result, migration } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${idPrefix}-mig`,
		filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: parent.id, custom: false },
					customize: {
						upsert_licenses: [
							{
								license_plan_id: devSeat.id,
								customize: {
									add_items: [
										itemsV2.monthlyMessages({ included: ADDED_MESSAGES }),
									],
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

	const assignmentIds = assignments.map((assignment) => assignment.id);
	const rows = await ctx.db
		.select({ featureId: customerEntitlements.feature_id })
		.from(customerEntitlements)
		.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
	const messageRows = rows.filter(
		(row) => row.featureId === TestFeature.Messages,
	);

	expect(messageRows).toHaveLength(0);

	// The pool repoint alone puts the customer in `succeeded`, so the run claims
	// the item was granted while no assignment row exists to carry it. Only a
	// run that actually wrote a row may report success.
	const itemRuns = await ctx.db
		.select({ status: migrationItemRuns.status })
		.from(migrationItemRuns)
		.where(eq(migrationItemRuns.migration_internal_id, migration.internal_id));
	expect(itemRuns.length).toBeGreaterThan(0);
	expect(itemRuns.every((run) => run.status !== "succeeded")).toBe(true);
});
