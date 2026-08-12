/**
 * Changing a rollover item's interval must not run on the batch lane.
 *
 * The remove and the add carry different match keys, so the removal is a
 * standalone deletion rather than a modify-in-place. rollovers.cus_ent_id
 * cascades on delete, so the batch lane would silently drop accrued balances.
 *
 * Red: the op runs on the batch lane.
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
const QUARTERLY_MESSAGES = 300;
const ROLLOVER_MAX = 500;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: changing a rollover item's interval stays off the batch lane")}`, async () => {
	const customerId = "batch-rollover-guard-customer";
	const idPrefix = "batch-rollover-guard";

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
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											interval: ResetInterval.Month,
											interval_count: 1,
										},
									],
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

	expect(result?.lane).toBe("per_customer");
});
