import { expect, test } from "bun:test";
import {
	BillingInterval,
	customerEntitlements,
	migrationItemRuns,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const NEW_SEAT_MESSAGES = 200;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const CONSUMED = 60;
const SEAT_PRICE = 20;

test(`${chalk.yellowBright("batch-license-customize: editing an existing allowance batch-lowers")}`, async () => {
	const customerId = "batch-item-edit-customer";
	const idPrefix = "batch-item-edit";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	await ctx.db
		.update(customerEntitlements)
		.set({ balance: SEAT_MESSAGES - CONSUMED })
		.where(
			eq(customerEntitlements.customer_product_id, liveAssignments[0]!.id),
		);

	const { result, migration } = await runChunkedMigration({
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

	expect(result?.lane).toBe("batch");

	const itemRuns = await ctx.db
		.select({ status: migrationItemRuns.status })
		.from(migrationItemRuns)
		.where(eq(migrationItemRuns.migration_internal_id, migration.internal_id));
	expect(itemRuns.length).toBeGreaterThan(0);
	expect(itemRuns.every((run) => run.status !== "skipped")).toBe(true);

	const readMessageRows = async () => {
		const rows = await ctx.db
			.select({
				featureId: customerEntitlements.feature_id,
				balance: customerEntitlements.balance,
			})
			.from(customerEntitlements)
			.where(
				inArray(
					customerEntitlements.customer_product_id,
					liveAssignments.map((assignment) => assignment.id),
				),
			);
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	const converged = await pollUntil({
		fetch: readMessageRows,
		until: (rows) =>
			rows.length >= ASSIGNED_SEATS &&
			rows.every((row) => row.balance > SEAT_MESSAGES),
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	expect(converged).toHaveLength(ASSIGNED_SEATS);
	expect(converged.map((row) => row.balance).sort((a, b) => a - b)).toEqual([
		NEW_SEAT_MESSAGES - CONSUMED,
		NEW_SEAT_MESSAGES,
	]);
});

test(`${chalk.yellowBright("batch-license-customize: editing an allowance on a PRICED license plan batch-lowers")}`, async () => {
	const customerId = "batch-item-edit-priced-customer";
	const idPrefix = "batch-item-edit-priced";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: SEAT_PRICE,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	await ctx.db
		.update(customerEntitlements)
		.set({ balance: SEAT_MESSAGES - CONSUMED })
		.where(
			eq(customerEntitlements.customer_product_id, liveAssignments[0]!.id),
		);

	const { result, migration } = await runChunkedMigration({
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

	expect(result?.lane).toBe("batch");

	const readMessageRows = async () => {
		const rows = await ctx.db
			.select({
				featureId: customerEntitlements.feature_id,
				balance: customerEntitlements.balance,
			})
			.from(customerEntitlements)
			.where(
				inArray(
					customerEntitlements.customer_product_id,
					liveAssignments.map((assignment) => assignment.id),
				),
			);
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	const converged = await pollUntil({
		fetch: readMessageRows,
		until: (rows) =>
			rows.length >= ASSIGNED_SEATS &&
			rows.every((row) => row.balance > SEAT_MESSAGES),
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	expect(converged).toHaveLength(ASSIGNED_SEATS);
	expect(converged.map((row) => row.balance).sort((a, b) => a - b)).toEqual([
		NEW_SEAT_MESSAGES - CONSUMED,
		NEW_SEAT_MESSAGES,
	]);
});
