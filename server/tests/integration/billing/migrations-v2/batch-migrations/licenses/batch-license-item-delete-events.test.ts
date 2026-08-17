/**
 * A license item delete must describe itself in the migration item event.
 *
 * Both finalize builders are driven off insertedItems, and a removal inserts
 * nothing, so the customer is reported as changed with an empty preview: no
 * plan change, no item change, nothing naming the dropped feature.
 *
 * Red: the event carries zero plan changes.
 * Green: one `updated` plan change carrying a `deleted` item change for the
 * feature the migration dropped.
 */
import { expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "../../utils/expectMigrationItemEvent";

const SEAT_MESSAGES = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: a delete describes itself in the item event")}`, async () => {
	const runSuffix = Date.now();
	const customerId = `batch-delete-events-${runSuffix}`;
	const idPrefix = `batch-delete-events-${runSuffix}`;

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [
			items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			items.dashboard(),
		],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;

	const { result, migration, migrationRunId } = await runChunkedMigration({
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

	expect(result?.lane).toBe("batch");

	const events = await getMigrationItemEvents({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		expectedCount: 1,
	});
	if (!events) return;

	// One plan change per assignment: each seat is its own customer product,
	// grouped the same way an insert is.
	await expectMigrationItemEventCorrect({
		ctx,
		events,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
		planChangeActions: ["updated", "updated"],
		itemChangeCount: 1,
	});
});
