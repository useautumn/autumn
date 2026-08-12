/**
 * Editing a boolean license item must not touch the assignments' balances.
 * Both sides are non-tracking, so computeBalancePatch specifies no write at all.
 *
 * Red: the held balance is overwritten with 0.
 * Green: the balance survives and the rows still move onto the new definition.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const HELD_BALANCE = 25;

test(`${chalk.yellowBright("batch-license-customize: editing a boolean item leaves balances untouched")}`, async () => {
	const customerId = "batch-boolean-edit-customer";
	const idPrefix = "batch-boolean-edit";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.dashboard()],
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
		.where(
			and(
				inArray(customerEntitlements.customer_product_id, assignmentIds),
				eq(customerEntitlements.feature_id, TestFeature.Dashboard),
			),
		);

	// One match key across the add and remove, so this is a modify-in-place.
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
									add_items: [{ feature_id: TestFeature.Dashboard }],
									remove_items: [{ feature_id: TestFeature.Dashboard }],
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
			.select({
				balance: customerEntitlements.balance,
				featureId: customerEntitlements.feature_id,
			})
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
		return rows.filter((row) => row.featureId === TestFeature.Dashboard);
	};

	const converged = await pollUntil({
		fetch: readDashboardRows,
		until: (rows) => rows.length === ASSIGNED_SEATS,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	expect(converged).toHaveLength(ASSIGNED_SEATS);
	for (const row of converged) {
		expect(row.balance).toBe(HELD_BALANCE);
	}
});
