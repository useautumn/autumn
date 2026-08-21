/**
 * Replacing a parent-plan item must not repoint license assignment rows that
 * grant the same feature and definition shape.
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
import { and, eq, inArray } from "drizzle-orm";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch migration: parent replace spares license assignments and pools")}`, async () => {
	const customerId = "batch-replace-license-isolation";
	const idPrefix = "batch-replace-license";
	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		parentItems: [items.monthlyMessages({ includedUsage: 100 })],
		seatItems: [items.monthlyMessages({ includedUsage: 100 })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent } = scenario;
	const beforeState = await getLicenseDbState({ db: ctx.db, customerId });
	const assignmentIds = beforeState.assignments
		.filter((assignment) => assignment.internal_entity_id)
		.map((assignment) => assignment.id);
	const parentProductIds = beforeState.products
		.filter((product) => !product.customer_license_link_id)
		.map((product) => product.id);

	const readMessageRows = async ({
		customerProductIds,
	}: {
		customerProductIds: string[];
	}) =>
		ctx.db
			.select({
				id: customerEntitlements.id,
				customerProductId: customerEntitlements.customer_product_id,
				entitlementId: customerEntitlements.entitlement_id,
				balance: customerEntitlements.balance,
			})
			.from(customerEntitlements)
			.where(
				and(
					inArray(customerEntitlements.customer_product_id, customerProductIds),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);

	const [parentBefore] = await readMessageRows({
		customerProductIds: parentProductIds,
	});
	const assignmentsBefore = await readMessageRows({
		customerProductIds: assignmentIds,
	});
	expect(parentBefore).toBeDefined();
	expect(assignmentsBefore).toHaveLength(ASSIGNED_SEATS);

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
						add_items: [itemsV2.monthlyMessages({ included: 200 })],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	const [parentAfter] = await readMessageRows({
		customerProductIds: parentProductIds,
	});
	expect(parentAfter.id).toBe(parentBefore.id);
	expect(parentAfter.entitlementId).not.toBe(parentBefore.entitlementId);

	const assignmentsAfter = await readMessageRows({
		customerProductIds: assignmentIds,
	});
	expect(assignmentsAfter).toEqual(assignmentsBefore);

	const afterState = await getLicenseDbState({ db: ctx.db, customerId });
	expect(afterState.pools.map((pool) => pool.granted)).toEqual(
		beforeState.pools.map((pool) => pool.granted),
	);
});
