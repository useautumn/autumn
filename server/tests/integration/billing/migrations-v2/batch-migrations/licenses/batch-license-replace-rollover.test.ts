/**
 * Editing a ROLLOVER-bearing license item in place must not run on the batch
 * lane.
 *
 * DELETING a rollover item is rejected by `removes_rollover_item`. An in-place
 * edit takes the ADD artifact branch, which never sets that flag, so it
 * batch-lowers. The replace was believed safe because it UPDATEs rather than
 * deletes, preserving customer_entitlements.id and so the rollovers rows that
 * FK onto it. Preserving them is exactly the problem: the accrued rollover rows
 * survive onto whatever definition the edit lands on. If the new item drops or
 * changes the rollover config, nothing clears or clamps them —
 * performMaximumClearing only runs when a NEW rollover is written — and the
 * deduction path reads cusEnt.rollovers ungated by entitlement.rollover, so the
 * orphaned balance is still spent while /balance no longer reports it.
 *
 * Red: the op runs on the batch lane, leaving rollover rows attached to an
 * entitlement that no longer declares rollover.
 * Green: the op is rejected to the per-customer lane.
 */
import { expect, test } from "bun:test";
import { ResetInterval, RolloverExpiryDurationType } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";

const SEAT_MESSAGES = 100;
const NEW_SEAT_MESSAGES = 200;
const ROLLOVER_MAX = 500;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: editing a rollover item in place stays off the batch lane")}`, async () => {
	const customerId = "batch-replace-rollover-customer";
	const idPrefix = "batch-replace-rollover";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [
			items.monthlyMessagesWithRollover({
				includedUsage: SEAT_MESSAGES,
				rolloverConfig: {
					max: ROLLOVER_MAX,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			}),
		],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;

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
											included: NEW_SEAT_MESSAGES,
											reset: {
												interval: ResetInterval.Month,
												interval_count: 1,
											},
										},
									],
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											interval: ResetInterval.Month,
											interval_count: 1,
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

	expect(result?.lane).toBe("per_customer");
});
