/**
 * Repro: dashboard "Apply & migrate" on a license plan that a batch migration
 * previously customized. Add one item, delete another, change the base price,
 * and propagate to the parent — the shape from the screenshot.
 */
import { expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";

test(`${chalk.yellowBright("repro: plan save after a batch license migration")}`, async () => {
	const customerId = "fk-save-customer";
	const idPrefix = "fk-save";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: 10,
		seatItems: [items.dashboard()],
		includedSeats: 1,
		attachedSeats: 3,
	});
	await scenario.assignSeats({ count: 2 });
	const { ctx, autumnV2_2, autumnV2_3, parent, devSeat } = scenario;

	// A batch migration first customizes the link, minting a custom entitlement.
	const migrated = await runChunkedMigration({
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
										{ feature_id: TestFeature.Dashboard, pooled: true },
									],
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
	expect(migrated.result?.lane).toBe("batch");

	// Now the dashboard save: add Messages, drop Dashboard, bump the base price,
	// and propagate to the parent.
	const response = await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [itemsV2.monthlyMessages({ included: 123 })],
		disable_version: true,
		update_license_parents: [{ plan_id: parent.id, version: 1 }],
	});

	expect(response).toBeDefined();
});
