/**
 * Deleting a pooled license item must not run on the charge-free batch lane.
 *
 * Adding a pooled item is already rejected (`pooled_add_item`), but the remove
 * artifact computes only removes_priced_item / removes_entity_scoped_item /
 * removes_rollover_item — there is no removes_pooled_item, so the removal
 * batch-lowers. The remove SQL then excludes every row it would need to touch:
 * the anchor via `NOT target.is_pooled_balance` and every contribution via
 * `target.pooled_contribution_id IS NULL`. The DELETE matches zero rows, no
 * cleanup path reclaims the pool, and the FullCustomer read selects the anchor
 * purely on pooled_balance_id with no tie back to the catalog item set — so the
 * parent keeps being granted a feature the plan no longer has.
 *
 * validateLicenseLink only inspects the license product's entitlements at LINK
 * time, so the pooled item is added to the license plan after the link exists.
 *
 * Red: the removal batch-lowers (lane is `batch`) and the pooled rows survive.
 * Green: the op is rejected to the per-customer lane.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: deleting a pooled item stays off the batch lane")}`, async () => {
	const customerId = "batch-delete-pooled-customer";
	const idPrefix = "batch-delete-pooled";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.dashboard()],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;

	await autumnV2_2.post("/plans.update", {
		plan_id: devSeat.id,
		items: [
			itemsV2.dashboard(),
			{
				feature_id: TestFeature.Messages,
				included: SEAT_MESSAGES,
				pooled: true,
			},
		],
	});

	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const assignmentIds = assignments
		.filter((assignment) => assignment.internal_entity_id)
		.map((assignment) => assignment.id);

	const readMessageRows = async () => {
		const rows = await ctx.db
			.select({
				id: customerEntitlements.id,
				featureId: customerEntitlements.feature_id,
			})
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	await readMessageRows();

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
									remove_items: [{ feature_id: TestFeature.Messages }],
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
