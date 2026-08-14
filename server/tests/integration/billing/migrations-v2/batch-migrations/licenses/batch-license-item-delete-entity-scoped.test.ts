/**
 * Deleting an entity-scoped license item must not run on the charge-free batch
 * lane.
 *
 * Adding an entity-scoped entitlement is already rejected because it fans out
 * one row per entity. Deleting one is the same shape in reverse: the rows carry
 * per-entity sub-balances, so a set-based delete loses state that varies per
 * customer.
 *
 * Red: the removal batch-lowers (lane is `batch`).
 * Green: the op is rejected to the per-customer lane.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: deleting an entity-scoped item stays off the batch lane")}`, async () => {
	const customerId = "batch-delete-entity-scoped-customer";
	const idPrefix = "batch-delete-entity-scoped";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [
			items.monthlyMessages({
				includedUsage: SEAT_MESSAGES,
				entityFeatureId: TestFeature.Users,
			}),
			items.dashboard(),
		],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	const assignmentIds = liveAssignments.map((assignment) => assignment.id);

	const readRows = async () =>
		await ctx.db
			.select({ featureId: customerEntitlements.feature_id })
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));

	const messageRowsBefore = (await readRows()).filter(
		(row) => row.featureId === TestFeature.Messages,
	);
	expect(messageRowsBefore).toHaveLength(ASSIGNED_SEATS);

	const { result } = await runChunkedMigration({
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
									remove_items: [{ feature_id: TestFeature.Messages }],
								},
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("per_customer");
});
