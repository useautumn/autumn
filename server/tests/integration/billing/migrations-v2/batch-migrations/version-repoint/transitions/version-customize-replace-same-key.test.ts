/**
 * version + customize replace (remove+add same key) swaps the FROM item's
 * definition: the customer ends on the customize's allowance, NOT the target
 * catalog's, while other FROM items keep their v1 claims and the row still
 * repoints to the target version.
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
	`${chalk.yellowBright("batch version repoint transitions: customize replace swaps the from item's definition")}`,
	async () => {
		const stem = `bvrt-repl-key-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
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
		// The target's own definitions (Messages 500, Words 50) are irrelevant
		// under item customize: the version is a pure repoint.
		await mintPlanVersion({
			client: autumnV2_3,
			planId: plan.id,
			items: [
				itemsV2.monthlyMessages({ included: 500 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const wordsBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Words,
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
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [itemsV2.monthlyMessages({ included: 200 })],
						},
					},
				],
			},
		});

		await expectVersionRepointedOnce({
			ctx,
			customerId,
			planId: plan.id,
			before,
			targetVersion: 2,
			result,
		});

		// Messages lands on the customize's 200 — not the target catalog's 500.
		const messagesAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(messagesAfter.id).toBe(messagesBefore.id);
		expect(messagesAfter.entitlement_id).not.toBe(
			messagesBefore.entitlement_id,
		);
		expect(messagesAfter.balance).toBe(200);

		// Untouched Words keeps its v1 claim and allowance (25, not 50).
		const wordsAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Words,
		});
		expect(wordsAfter.id).toBe(wordsBefore.id);
		expect(wordsAfter.entitlement_id).toBe(wordsBefore.entitlement_id);
		expect(wordsAfter.balance).toBe(25);
	},
);
