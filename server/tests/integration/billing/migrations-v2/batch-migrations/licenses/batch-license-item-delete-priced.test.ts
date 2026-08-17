/**
 * Deleting a paid license item must not run on the charge-free batch lane.
 *
 * A removal names a PlanItemFilter, which carries no price, so the op-level
 * guard cannot tell a free item from a paid one. Left unguarded the batch lane
 * drops the assignments' customer_prices with no Stripe write, so Autumn stops
 * modelling a charge the subscription still bills.
 *
 * Red: the op runs on the batch lane and deletes the paired prices.
 * Green: the op is rejected to the per-customer lane.
 */
import { expect, test } from "bun:test";
import { customerPrices } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: deleting a paid item stays off the batch lane")}`, async () => {
	const customerId = "batch-delete-priced-customer";
	const idPrefix = "batch-delete-priced";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: 20,
		seatItems: [
			items.prepaidMessages({ billingUnits: 100, price: 10 }),
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

	const readPrices = async () =>
		await ctx.db
			.select({ id: customerPrices.id })
			.from(customerPrices)
			.where(inArray(customerPrices.customer_product_id, assignmentIds));

	const pricesBefore = await readPrices();

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

	const pricesAfter = await readPrices();
	expect(pricesAfter.length).toBe(pricesBefore.length);
});
