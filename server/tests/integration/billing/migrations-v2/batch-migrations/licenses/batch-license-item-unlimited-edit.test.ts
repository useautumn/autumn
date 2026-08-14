/**
 * Flipping a license item from a finite allowance to unlimited. tracksBalance
 * differs across the two definitions, so the balance is set to the incoming
 * starting balance rather than credited by a delta.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, ResetInterval } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const HELD_BALANCE = 25;

test(`${chalk.yellowBright("batch-license-customize: editing an unlimited item keeps the held balance")}`, async () => {
	const customerId = "batch-unlimited-edit-customer";
	const idPrefix = "batch-unlimited-edit";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.lifetimeMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	const assignmentIds = liveAssignments.map((assignment) => assignment.id);

	await ctx.db
		.update(customerEntitlements)
		.set({ balance: HELD_BALANCE })
		.where(inArray(customerEntitlements.customer_product_id, assignmentIds));

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
							{
								license_plan_id: devSeat.id,
								customize: {
									add_items: [
										{ feature_id: TestFeature.Messages, unlimited: true },
									],
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

	const readRows = async () =>
		await ctx.db
			.select({
				balance: customerEntitlements.balance,
				unlimited: customerEntitlements.unlimited,
				featureId: customerEntitlements.feature_id,
			})
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));

	const converged = await pollUntil({
		fetch: readRows,
		until: (rows) =>
			rows.filter((row) => row.featureId === TestFeature.Messages).length ===
			ASSIGNED_SEATS,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	const messageRows = converged.filter(
		(row) => row.featureId === TestFeature.Messages,
	);
	expect(messageRows).toHaveLength(ASSIGNED_SEATS);

	for (const row of messageRows) {
		expect(row.unlimited).toBe(true);
		expect(row.balance).toBe(0);
	}
});
