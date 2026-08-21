/**
 * License customize replace with included: 100 rewrites catalog-shaped seat
 * grants and leaves a customized 1k seat alone.
 *
 * Contract (L1 execute): assignment at 100 → 200 with consumption carried;
 * assignment at 1k untouched.
 * Unmatched 100→200 + leftover boolean: 1k seat spared, dashboard lands.
 *
 * Catalog draft stamp for the same delta lives in
 * catalog-v2/plans/migrations/licenses/included-filter-drafts.test.ts.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	customerEntitlements,
	entitlements,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import {
	expectLicenseAssignmentFeaturePresent,
	expectLicenseAssignmentMessagesCorrect,
} from "@tests/integration/licenses/utils/expectLicenseAssignmentMessagesCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";

const SEAT_MESSAGES = 100;
const CUSTOM_1K_ALLOWANCE = 1000;
const NEW_SEAT_MESSAGES = 200;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const CONSUMED = 60;

const repointAssignmentToCustomAllowance = async ({
	db,
	customerProductId,
	allowance,
}: {
	db: Parameters<typeof getLicenseDbState>[0]["db"];
	customerProductId: string;
	allowance: number;
}) => {
	const [row] = await db
		.select()
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_product_id, customerProductId),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);
	if (!row) throw new Error(`expected messages row on ${customerProductId}`);

	const [definition] = await db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, row.entitlement_id));
	if (!definition) throw new Error("expected entitlement definition");

	const customId = generateId("ent");
	await db.insert(entitlements).values({
		...definition,
		id: customId,
		is_custom: true,
		allowance,
	});
	await db
		.update(customerEntitlements)
		.set({ entitlement_id: customId, balance: allowance })
		.where(eq(customerEntitlements.id, row.id));
};

test(`${chalk.yellowBright("batch-license-customize: included 100 rewrites catalog seats and spares 1k")}`, async () => {
	const customerId = "batch-item-included-customer";
	const idPrefix = "batch-item-included";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_3, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	const catalogAssignmentId = liveAssignments[0]!.id;
	const custom1kAssignmentId = liveAssignments[1]!.id;

	await ctx.db
		.update(customerEntitlements)
		.set({ balance: SEAT_MESSAGES - CONSUMED })
		.where(eq(customerEntitlements.customer_product_id, catalogAssignmentId));

	await repointAssignmentToCustomAllowance({
		db: ctx.db,
		customerProductId: custom1kAssignmentId,
		allowance: CUSTOM_1K_ALLOWANCE,
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_3,
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
											included: SEAT_MESSAGES,
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

	const readAssignmentBalance = async ({
		customerProductId,
	}: {
		customerProductId: string;
	}) => {
		const [row] = await ctx.db
			.select({
				balance: customerEntitlements.balance,
				entitlementId: customerEntitlements.entitlement_id,
			})
			.from(customerEntitlements)
			.where(
				and(
					eq(customerEntitlements.customer_product_id, customerProductId),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);
		return row;
	};

	const catalogConverged = await pollUntil({
		fetch: () => readAssignmentBalance({ customerProductId: catalogAssignmentId }),
		until: (row) => row?.balance === NEW_SEAT_MESSAGES - CONSUMED,
		timeoutMs: 15_000,
		intervalMs: 250,
	});
	expect(catalogConverged?.balance).toBe(NEW_SEAT_MESSAGES - CONSUMED);

	const custom1k = await readAssignmentBalance({
		customerProductId: custom1kAssignmentId,
	});
	expect(custom1k?.balance).toBe(CUSTOM_1K_ALLOWANCE);

	const allRows = await ctx.db
		.select({ featureId: customerEntitlements.feature_id })
		.from(customerEntitlements)
		.where(
			inArray(
				customerEntitlements.customer_product_id,
				liveAssignments.map((assignment) => assignment.id),
			),
		);
	expect(
		allRows.filter((row) => row.featureId === TestFeature.Messages),
	).toHaveLength(ASSIGNED_SEATS);
});

test(`${chalk.yellowBright("batch-license-customize: unmatched 100→200 still adds boolean on 1k seat")}`, async () => {
	const customerId = "batch-item-included-leftover";
	const idPrefix = "batch-item-leftover";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_3, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	const catalogAssignmentId = liveAssignments[0]!.id;
	const custom1kAssignmentId = liveAssignments[1]!.id;

	await repointAssignmentToCustomAllowance({
		db: ctx.db,
		customerProductId: custom1kAssignmentId,
		allowance: CUSTOM_1K_ALLOWANCE,
	});

	const [custom1kBefore] = await ctx.db
		.select({ entitlementId: customerEntitlements.entitlement_id })
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_product_id, custom1kAssignmentId),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_3,
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
										itemsV2.dashboard(),
									],
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											interval: BillingInterval.Month,
											interval_count: 1,
											included: SEAT_MESSAGES,
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

	await expectLicenseAssignmentMessagesCorrect({
		ctx,
		customerProductId: catalogAssignmentId,
		featureId: TestFeature.Messages,
		balance: NEW_SEAT_MESSAGES,
	});
	await expectLicenseAssignmentMessagesCorrect({
		ctx,
		customerProductId: custom1kAssignmentId,
		featureId: TestFeature.Messages,
		balance: CUSTOM_1K_ALLOWANCE,
		entitlementId: custom1kBefore?.entitlementId,
	});
	await expectLicenseAssignmentFeaturePresent({
		ctx,
		customerProductId: custom1kAssignmentId,
		featureId: TestFeature.Dashboard,
	});
	await expectLicenseAssignmentFeaturePresent({
		ctx,
		customerProductId: catalogAssignmentId,
		featureId: TestFeature.Dashboard,
	});
});
