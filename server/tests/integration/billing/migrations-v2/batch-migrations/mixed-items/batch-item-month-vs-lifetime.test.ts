/**
 * A month filter must not touch a lifetime sibling of the same feature.
 *
 * Contract:
 *   remove month → monthly row gone, lifetime row unchanged
 *   replace month → monthly rewritten, lifetime row unchanged
 *   C5 add month beside lifetime → sibling monthly row, lifetime kept
 *
 * Month-vs-quarter lives in the *-interval-narrowing tests; do not duplicate it.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
	EntInterval,
	entitlements,
	ResetInterval,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { expectCustomerEntitlementRowCount, type ScenarioCtx } from "../batchTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const MONTHLY_INCLUDED = 100;
const LIFETIME_INCLUDED = 50;
const REPLACED_MONTHLY = 200;
const ADDED_MONTHLY = 80;

const readMessageRows = async ({
	ctx,
	customerId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
}) =>
	ctx.db
		.select({
			id: customerEntitlements.id,
			entitlementId: customerEntitlements.entitlement_id,
			balance: customerEntitlements.balance,
			interval: entitlements.interval,
		})
		.from(customerEntitlements)
		.innerJoin(
			entitlements,
			eq(entitlements.id, customerEntitlements.entitlement_id),
		)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, customerEntitlements.customer_product_id),
		)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerProducts.internal_customer_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);

const isLifetimeInterval = (interval: string | null) =>
	interval === null || interval === EntInterval.Lifetime;

const splitCadence = (
	rows: Awaited<ReturnType<typeof readMessageRows>>,
) => ({
	monthly: rows.find((row) => row.interval === EntInterval.Month),
	lifetime: rows.find((row) => isLifetimeInterval(row.interval)),
});

test.concurrent(
	`${chalk.yellowBright("batch delete: a month filter leaves the lifetime sibling")}`,
	async () => {
		const customerId = "batch-del-month-keep-life";
		const plan = products.base({
			id: "batch-del-month-keep-life-plan",
			items: [
				items.monthlyMessages({ includedUsage: MONTHLY_INCLUDED }),
				items.lifetimeMessages({ includedUsage: LIFETIME_INCLUDED }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const before = splitCadence(await readMessageRows({ ctx, customerId }));
		expect(before.monthly).toBeDefined();
		expect(before.lifetime).toBeDefined();
		if (!before.monthly || !before.lifetime) {
			throw new Error("Expected monthly and lifetime message rows");
		}

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-del-month-keep-life-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: ResetInterval.Month,
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		const after = splitCadence(await readMessageRows({ ctx, customerId }));
		expect(after.monthly).toBeUndefined();
		expect(after.lifetime).toEqual(before.lifetime);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: a month filter leaves the lifetime sibling")}`,
	async () => {
		const customerId = "batch-rep-month-keep-life";
		const plan = products.base({
			id: "batch-rep-month-keep-life-plan",
			items: [
				items.monthlyMessages({ includedUsage: MONTHLY_INCLUDED }),
				items.lifetimeMessages({ includedUsage: LIFETIME_INCLUDED }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const before = splitCadence(await readMessageRows({ ctx, customerId }));
		expect(before.monthly).toBeDefined();
		expect(before.lifetime).toBeDefined();
		if (!before.monthly || !before.lifetime) {
			throw new Error("Expected monthly and lifetime message rows");
		}

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-rep-month-keep-life-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: ResetInterval.Month,
								},
							],
							add_items: [
								itemsV2.monthlyMessages({ included: REPLACED_MONTHLY }),
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		const after = splitCadence(await readMessageRows({ ctx, customerId }));
		expect(after.monthly).toMatchObject({
			id: before.monthly.id,
			balance: REPLACED_MONTHLY,
		});
		expect(after.monthly?.entitlementId).not.toBe(before.monthly.entitlementId);
		expect(after.lifetime).toEqual(before.lifetime);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch add: month beside lifetime inserts a sibling")}`,
	async () => {
		const customerId = "batch-add-month-beside-life";
		const plan = products.base({
			id: "batch-add-month-beside-life-plan",
			items: [items.lifetimeMessages({ includedUsage: LIFETIME_INCLUDED })],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const before = splitCadence(await readMessageRows({ ctx, customerId }));
		expect(before.lifetime).toBeDefined();
		expect(before.monthly).toBeUndefined();
		if (!before.lifetime) {
			throw new Error("Expected a lifetime message row");
		}

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-add-month-beside-life-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							add_items: [
								itemsV2.monthlyMessages({ included: ADDED_MONTHLY }),
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		const after = splitCadence(await readMessageRows({ ctx, customerId }));
		expect(after.lifetime).toEqual(before.lifetime);
		expect(after.monthly?.balance).toBe(ADDED_MONTHLY);
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 2,
		});
	},
);
