/**
 * C4: a paid row with a different allowance than the catalog is untouchable
 * on the batch lane (rowIsUnpaidSql), for both remove and replace.
 *
 * Same-allowance paid rows stay in batch-*-item-paid-rows.test.ts.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../batchTestUtils";
import {
	attachSyntheticPaidPrice,
	expectCustomerPriceSurvives,
	readScopedFeatureRow,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const CATALOG_ALLOWANCE = 100;
const PAID_ALLOWANCE = 200;

const paidDifferentSetup = async ({
	catalogCustomerId,
	paidCustomerId,
	planId,
}: {
	catalogCustomerId: string;
	paidCustomerId: string;
	planId: string;
}) => {
	const plan = products.base({
		id: planId,
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE }),
		],
	});

	const { ctx, autumnV2_3 } = await initScenario({
		customerId: catalogCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: paidCustomerId }]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: plan.id }),
				s.billing.attach({
					customerId: paidCustomerId,
					productId: plan.id,
				}),
			),
		],
	});

	await repointToCustomEntitlement({
		ctx,
		customerId: paidCustomerId,
		featureId: TestFeature.Messages,
		overrides: { allowance: PAID_ALLOWANCE },
	});
	await setScopedFeatureBalance({
		ctx,
		customerId: paidCustomerId,
		featureId: TestFeature.Messages,
		balance: PAID_ALLOWANCE,
	});
	const paid = await attachSyntheticPaidPrice({
		ctx,
		customerId: paidCustomerId,
		featureId: TestFeature.Messages,
	});
	const paidBefore = await readScopedFeatureRow({
		ctx,
		customerId: paidCustomerId,
		featureId: TestFeature.Messages,
	});

	return { ctx, autumnV2_3, planId: plan.id, paid, paidBefore };
};

test.concurrent(
	`${chalk.yellowBright("batch delete: a paid different-allowance row is never removed")}`,
	async () => {
		const catalogCustomerId = "batch-del-paid-diff-catalog";
		const paidCustomerId = "batch-del-paid-diff-200";
		const { ctx, autumnV2_3, planId, paid, paidBefore } =
			await paidDifferentSetup({
				catalogCustomerId,
				paidCustomerId,
				planId: "batch-del-paid-diff-plan",
			});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-del-paid-diff-migration",
			filter: { customer: { plan: { plan_id: planId, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planId, custom: false },
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

		await expectCustomerEntitlementRowCount({
			ctx,
			customerId: catalogCustomerId,
			planId,
			featureId: TestFeature.Messages,
			count: 0,
		});

		const paidAfter = await readScopedFeatureRow({
			ctx,
			customerId: paidCustomerId,
			featureId: TestFeature.Messages,
		});
		expect(paidAfter.id).toBe(paidBefore.id);
		expect(paidAfter.entitlement_id).toBe(paidBefore.entitlement_id);
		expect(paidAfter.balance).toBe(PAID_ALLOWANCE);
		await expectCustomerPriceSurvives({
			ctx,
			customerPriceId: paid.customerPriceId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: a paid different-allowance row is never rewritten")}`,
	async () => {
		const catalogCustomerId = "batch-rep-paid-diff-catalog";
		const paidCustomerId = "batch-rep-paid-diff-200";
		const { ctx, autumnV2_3, planId, paid, paidBefore } =
			await paidDifferentSetup({
				catalogCustomerId,
				paidCustomerId,
				planId: "batch-rep-paid-diff-plan",
			});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-rep-paid-diff-migration",
			filter: { customer: { plan: { plan_id: planId, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planId, custom: false },
						customize: {
							add_items: [itemsV2.monthlyMessages({ included: 30 })],
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

		const catalogAfter = await readScopedFeatureRow({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
		});
		expect(catalogAfter.balance).toBe(30);

		const paidAfter = await readScopedFeatureRow({
			ctx,
			customerId: paidCustomerId,
			featureId: TestFeature.Messages,
		});
		expect(paidAfter.id).toBe(paidBefore.id);
		expect(paidAfter.entitlement_id).toBe(paidBefore.entitlement_id);
		expect(paidAfter.balance).toBe(PAID_ALLOWANCE);
		await expectCustomerPriceSurvives({
			ctx,
			customerPriceId: paid.customerPriceId,
		});
	},
);
