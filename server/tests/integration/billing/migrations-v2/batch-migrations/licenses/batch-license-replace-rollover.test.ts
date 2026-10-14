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
