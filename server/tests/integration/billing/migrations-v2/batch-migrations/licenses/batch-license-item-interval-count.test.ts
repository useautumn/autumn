/**
 * Adding a license item that differs from an existing one only by
 * interval_count must reach the assignments, leaving the original in place.
 *
 * Red: only the 1-monthly row survives; the 3-monthly item never lands.
 * Green: each assignment carries both rows, one per interval_count.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, entitlements, ResetInterval } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const QUARTERLY_MESSAGES = 300;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: an add differing only by interval_count still lands")}`, async () => {
	const customerId = "batch-interval-count-customer";
	const idPrefix = "batch-interval-count";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
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

	const readMessageRows = async () => {
		const rows = await ctx.db
			.select({
				customerProductId: customerEntitlements.customer_product_id,
				featureId: customerEntitlements.feature_id,
				intervalCount: entitlements.interval_count,
			})
			.from(customerEntitlements)
			.innerJoin(
				entitlements,
				eq(entitlements.id, customerEntitlements.entitlement_id),
			)
			.where(
				inArray(customerEntitlements.customer_product_id, assignmentIds),
			);
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	expect(await readMessageRows()).toHaveLength(ASSIGNED_SEATS);

	// A pure add: no remove_items, so nothing here should supersede the monthly item.
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
										{
											feature_id: TestFeature.Messages,
											included: QUARTERLY_MESSAGES,
											reset: {
												interval: ResetInterval.Month,
												interval_count: 3,
											},
										},
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

	const converged = await pollUntil({
		fetch: readMessageRows,
		until: (rows) => rows.length >= ASSIGNED_SEATS * 2,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	expect(converged).toHaveLength(ASSIGNED_SEATS * 2);
	for (const assignmentId of assignmentIds) {
		const forAssignment = converged.filter(
			(row) => row.customerProductId === assignmentId,
		);
		expect(forAssignment.map((row) => row.intervalCount).sort()).toEqual([
			1, 3,
		]);
	}
});
