/**
 * version + customize is a pure repoint with customize matching the
 * customer's CURRENT (from) items: a remove targeting an item the target
 * catalog no longer carries still matches the FROM item and removes cleanly —
 * no remove_item_unmatched rejection.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectVersionRepointedOnce,
	mintPlanVersion,
} from "../utils/versionDiffTestUtils";
import {
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch version repoint transitions: customize remove matches a from item absent from the target")}`,
	async () => {
		const stem = `bvrt-rm-from-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 25 }),
			],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		// The target version no longer carries Words.
		await mintPlanVersion({
			client: autumnV2_3,
			planId: plan.id,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const messagesBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, version: 1 },
						version: 2,
						customize: {
							remove_items: [{ feature_id: TestFeature.Words }],
						},
					},
				],
			},
		});

		// Batch lane accepted (no remove_item_unmatched) and the row repointed.
		await expectVersionRepointedOnce({
			ctx,
			customerId,
			planId: plan.id,
			before,
			targetVersion: 2,
			result,
		});

		// Words matched the FROM item and is removed from the customer.
		await expect(
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Words,
			}),
		).rejects.toThrow();

		// Untouched Messages keeps its from-version claim (pure repoint).
		const messagesAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(messagesAfter.id).toBe(messagesBefore.id);
		expect(messagesAfter.entitlement_id).toBe(messagesBefore.entitlement_id);
		expect(messagesAfter.balance).toBe(100);
	},
);
