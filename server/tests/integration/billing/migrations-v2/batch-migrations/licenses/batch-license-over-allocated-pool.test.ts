/**
 * A batch migration must not strand seats on an OVER-ALLOCATED pool.
 *
 * `repointLicensePoolsForPage` recomputes granted = included + paid_quantity and
 * clamps remaining at 0 via GREATEST(..., 0). When a customer holds more live
 * assignments than the new grant covers, the clamp hides the deficit: remaining
 * lands at 0 rather than negative, so `expireUnusedAssignments` — which keys off
 * `remaining < 0` — never sees the pool as over-allocated.
 *
 * Scenario: 3 paid seats all assigned, then a migration lowers `included` so the
 * grant shrinks below the live assignment count.
 *
 * Contract under test:
 *   - the pool's usage still reflects every live assignment
 *   - granted stays derived from included + paid_quantity
 *   - the pool does not silently report spare capacity it does not have:
 *     remaining must never exceed granted - usage
 *
 * Expected red: remaining is clamped to 0 while usage exceeds granted, so the
 * pool reads as fully allocated with no deficit and the surplus assignments are
 * never expired.
 */
import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";

const CATALOG_SEAT_PRICE = 20;
const INCLUDED_SEATS = 2;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 3;

test.concurrent(
	`${chalk.yellowBright("batch-license: an over-allocated pool keeps a truthful remaining after a migration")}`,
	async () => {
		const customerId = "probe-over-allocated-pool";
		const idPrefix = "probe-over-alloc";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: CATALOG_SEAT_PRICE,
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const { ctx, autumnV2_2, parent, devSeat } = scenario;

		const before = await getLicenseDbState({ db: ctx.db, customerId });
		const [poolBefore] = before.pools;
		expect(poolBefore).toBeDefined();
		const paidQuantity = poolBefore.paid_quantity;

		await runChunkedMigration({
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
									included: 0,
									customize: {
										add_items: [itemsV2.monthlyMessages({ included: 250 })],
									},
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		const state = await pollUntil({
			fetch: () => getLicenseDbState({ db: ctx.db, customerId }),
			until: (current) =>
				current.pools[0]?.plan_license_id !== poolBefore.plan_license_id,
			timeoutMs: 15_000,
			intervalMs: 250,
		});
		const [pool] = state.pools;
		expect(pool).toBeDefined();

		const liveAssignments = state.assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

		expect(pool.granted).toBe(paidQuantity);
		expect(pool.remaining).toBeLessThanOrEqual(
			pool.granted - liveAssignments.length,
		);
	},
);
