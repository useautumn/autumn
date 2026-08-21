/**
 * Filter-replace uses the live row's grant, not a catalog from→to diff.
 *
 * Contract:
 *   C14: catalog already 30, customer still on retired 10, consumed 3
 *        → remaining 27 (not left at 7, not reset to 30)
 *   C1b: already on the minted 30 id, consumed 3 → remaining 27, no extra credits
 *   C8 / C1b': live definition already matches incoming 200, different id
 *        → repoint, remaining stays 140 (consumed 60 of 200)
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
	expectReplacedFeatureRowCorrect,
	readScopedFeatureRow,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const replaceMessagesMonth = ({
	planId,
	included,
}: {
	planId: string;
	included: number;
}) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, custom: false },
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
					},
				],
				add_items: [itemsV2.monthlyMessages({ included })],
			},
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("batch replace: in-place catalog 30 still carries live 10 → remaining 27")}`,
	async () => {
		const customerId = "batch-replace-inplace-10to30";
		const plan = products.base({
			id: "batch-replace-inplace-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 30 }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await repointToCustomEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: 10 },
		});
		const before = await setScopedFeatureBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: 7,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-inplace-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: replaceMessagesMonth({ planId: plan.id, included: 30 }),
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		await expectReplacedFeatureRowCorrect({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			beforeRowId: before.id,
			beforeEntitlementId: before.entitlement_id,
			balance: 27,
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: already at minted 30 applies no extra credits")}`,
	async () => {
		const customerId = "batch-replace-already-at-30";
		const plan = products.base({
			id: "batch-replace-already-30-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 30 }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const before = await setScopedFeatureBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: 27,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-already-30-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: replaceMessagesMonth({ planId: plan.id, included: 30 }),
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		const after = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(after.id).toBe(before.id);
		expect(after.balance).toBe(27);
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: already-at-200 different id repoints with no extra credits")}`,
	async () => {
		const customerId = "batch-replace-already-200";
		const plan = products.base({
			id: "batch-replace-already-200-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await repointToCustomEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: 200 },
		});
		const before = await setScopedFeatureBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: 140,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-already-200-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: replaceMessagesMonth({ planId: plan.id, included: 200 }),
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		await expectReplacedFeatureRowCorrect({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			beforeRowId: before.id,
			beforeEntitlementId: before.entitlement_id,
			balance: 140,
		});
	},
);
