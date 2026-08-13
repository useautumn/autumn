/**
 * Versioning a license plan must not strand the seats already assigned from it.
 *
 * A pool snapshots the license product's INTERNAL id at attach, and that id is
 * per-version. Prepare resolves the parent's catalog link, which versioning
 * rebases, so the batch statements join a v2 id against pools still carrying v1
 * and match nothing while reporting success.
 *
 * Red: the run reports lane batch and touches no assignment.
 * Green: every live assignment gains the item.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const NEW_SEAT_MESSAGES = 150;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: a versioned license plan still reaches its seats")}`, async () => {
	const customerId = "batch-ver-child-customer";
	const idPrefix = "batch-ver-child";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, autumnV2_3, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);
	const assignmentIds = liveAssignments.map((assignment) => assignment.id);

	await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		items: [itemsV2.monthlyMessages({ included: NEW_SEAT_MESSAGES })],
	});

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
		until: (rows) => rows.length === ASSIGNED_SEATS,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	expect(converged).toHaveLength(ASSIGNED_SEATS);
});
