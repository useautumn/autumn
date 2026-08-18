/**
 * The batch lane's uniformity contract: prepare mints ONE entitlement row per
 * add item, and every migrated customer's replaced row repoints to that same
 * shared row — never a per-customer mint.
 */
import { expect, test } from "bun:test";
import { migrations } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { EnsurePricesAndEntitlementsResultSchema } from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/index.js";
import type { ScenarioCtx } from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const ORIGINAL_ALLOWANCE = 100;
const REPLACEMENT_ALLOWANCE = 200;

const PREPARED_ADDS_KEY = "ensure_prices_and_entitlements:update_plan";

const readPreparedAddEntitlementIds = async ({
	ctx,
	migrationInternalId,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
}) => {
	const [row] = await ctx.db
		.select({ preparedState: migrations.prepared_state })
		.from(migrations)
		.where(eq(migrations.internal_id, migrationInternalId));
	const prepared = EnsurePricesAndEntitlementsResultSchema.parse(
		(row?.preparedState as Record<string, unknown>)?.[PREPARED_ADDS_KEY],
	);
	return prepared.entitlements.map((entitlement) => entitlement.id);
};

test(`${chalk.yellowBright("batch replace_item: every migrated row repoints to the one shared prepared entitlement")}`, async () => {
	const customerIds = [
		"batch-replace-shared-ent-1",
		"batch-replace-shared-ent-2",
		"batch-replace-shared-ent-3",
	];
	const [mainCustomerId, ...otherCustomerIds] = customerIds;
	const plan = products.base({
		id: "batch-replace-shared-ent-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: ORIGINAL_ALLOWANCE }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherCustomerIds.map((id) => ({ id }))),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				...customerIds.map((customerId) =>
					s.attach({ customerId, productId: plan.id }),
				),
			),
		],
	});

	const beforeRows = await Promise.all(
		customerIds.map((customerId) =>
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			}),
		),
	);

	const { result, migration } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-shared-ent-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [
							itemsV2.monthlyMessages({ included: REPLACEMENT_ALLOWANCE }),
						],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect({
		lane: result?.lane,
		rejections: (result?.rejections ?? []).map(
			(rejection) => `${rejection.code}: ${rejection.message}`,
		),
	}).toEqual({ lane: "batch", rejections: [] });

	// Prepare minted exactly one shared entitlement for the one add item.
	const preparedEntitlementIds = await readPreparedAddEntitlementIds({
		ctx,
		migrationInternalId: migration.internal_id,
	});
	expect(preparedEntitlementIds).toHaveLength(1);
	const [sharedEntitlementId] = preparedEntitlementIds;

	const afterRows = await Promise.all(
		customerIds.map((customerId) =>
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			}),
		),
	);
	for (const [index, afterRow] of afterRows.entries()) {
		const beforeRow = beforeRows[index];
		if (!beforeRow) throw new Error("expected a before row");
		expect(afterRow.id).toBe(beforeRow.id);
		expect(afterRow.entitlement_id).not.toBe(beforeRow.entitlement_id);
		expect(afterRow.entitlement_id).toBe(sharedEntitlementId ?? "");
		expect(afterRow.balance).toBe(REPLACEMENT_ALLOWANCE);
	}
});
