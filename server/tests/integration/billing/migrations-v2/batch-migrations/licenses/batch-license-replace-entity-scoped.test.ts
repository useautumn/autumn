/**
 * Replacing an ENTITY-SCOPED license item with an unscoped one must not run on
 * the batch lane.
 *
 * The compute guard only rejects a replace whose NEW entitlement is scoped
 * (`enriched.entity_feature_id`); nothing inspects the entitlement being
 * replaced. DELETING a scoped item is rejected by `removes_entity_scoped_item`,
 * but a replace takes the ADD artifact branch, which never sets that flag.
 * replaceLicenseEntitlementRows then UPDATEs entitlement_id/balance/unlimited
 * and leaves the `entities` JSONB untouched, so a per-entity sub-balance map
 * survives onto an entitlement that has no entity scope to interpret it.
 *
 * Red: the op runs on the batch lane, repointing scoped rows at an unscoped
 * entitlement while their stale `entities` map persists.
 * Green: the op is rejected to the per-customer lane.
 */
import { expect, test } from "bun:test";
import { BillingInterval, customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const NEW_SEAT_MESSAGES = 200;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: replacing an entity-scoped item with an unscoped one stays off the batch lane")}`, async () => {
	const customerId = "batch-replace-entity-scoped-customer";
	const idPrefix = "batch-replace-entity-scoped";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [
			items.monthlyMessages({
				includedUsage: SEAT_MESSAGES,
				entityFeatureId: TestFeature.Users,
			}),
			items.dashboard(),
		],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	const assignmentIds = liveAssignments.map((assignment) => assignment.id);

	const readMessageRows = async () => {
		const rows = await ctx.db
			.select({
				featureId: customerEntitlements.feature_id,
				entitlementId: customerEntitlements.entitlement_id,
				entities: customerEntitlements.entities,
			})
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	const rowsBefore = await readMessageRows();
	expect(rowsBefore).toHaveLength(ASSIGNED_SEATS);

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
										itemsV2.monthlyMessages({ included: NEW_SEAT_MESSAGES }),
									],
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											interval: BillingInterval.Month,
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

	const rowsAfter = await readMessageRows();
	expect(rowsAfter.map((row) => row.entitlementId).sort()).toEqual(
		rowsBefore.map((row) => row.entitlementId).sort(),
	);
});
