/**
 * Every pooled transition shape declines the batch lane and completes on the
 * per-customer lane: pooled→pooled Δ, private→pooled, pooled→private.
 *
 * The batch lane's set-based writes never reach a pool's anchor row
 * (customer_product_id NULL), so `pooled_add_item` rejects any customize
 * whose remove/add sides touch a pooled entitlement.
 */
import { expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const SEAT_MESSAGES = 100;
const NEW_SEAT_MESSAGES = 200;

const removeMonthlyMessages = {
	feature_id: TestFeature.Messages,
	interval: BillingInterval.Month,
	interval_count: 1,
};

const laneCases = [
	{
		id: "pooled-delta",
		label: "pooled→pooled allowance change",
		seatItem: () => ({
			...items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			pooled: true,
		}),
		customize: {
			add_items: [
				{
					...itemsV2.monthlyMessages({ included: NEW_SEAT_MESSAGES }),
					pooled: true,
				},
			],
			remove_items: [removeMonthlyMessages],
		},
	},
	{
		id: "to-pooled",
		label: "private→pooled flip",
		seatItem: () => items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
		customize: {
			add_items: [
				{
					...itemsV2.monthlyMessages({ included: SEAT_MESSAGES }),
					pooled: true,
				},
			],
			remove_items: [removeMonthlyMessages],
		},
	},
	{
		id: "to-private",
		label: "pooled→private flip",
		seatItem: () => ({
			...items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			pooled: true,
		}),
		customize: {
			add_items: [itemsV2.monthlyMessages({ included: SEAT_MESSAGES })],
			remove_items: [removeMonthlyMessages],
		},
	},
];

for (const laneCase of laneCases) {
	test(`${chalk.yellowBright(`batch-license-pooled: ${laneCase.label} stays off the batch lane`)}`, async () => {
		const customerId = `batch-pooled-lane-${laneCase.id}`;
		const idPrefix = `batch-pooled-lane-${laneCase.id}`;

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatItems: [laneCase.seatItem()],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const { ctx, autumnV2_2, parent, devSeat } = scenario;

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
									customize: laneCase.customize,
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
}
