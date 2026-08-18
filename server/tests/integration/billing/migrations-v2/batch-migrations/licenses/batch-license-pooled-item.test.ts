/**
 * Adding a pooled license item must not run on the batch lane.
 *
 * A pooled item mints one anchor customer_entitlement (customer_product_id
 * NULL) plus a contribution row per assignment. The batch add/replace SQL
 * matches on assignment.id = target.customer_product_id, so it repoints the
 * contributions while the anchor keeps the old entitlement — forking a second
 * pool and double-granting the feature. validateLicenseLink already rejects
 * pooled license items on the per-customer lane; the batch prepare lane never
 * calls it.
 *
 * Red: the op runs on the batch lane.
 * Green: the op is rejected to the per-customer lane.
 */
import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: adding a pooled item stays off the batch lane")}`, async () => {
	const customerId = "batch-pooled-item-customer";
	const idPrefix = "batch-pooled-item";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: 20,
		seatItems: [items.dashboard()],
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
								customize: {
									add_items: [
										{
											...itemsV2.monthlyCredits({ included: 100 }),
											pooled: true,
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
