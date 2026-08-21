/**
 * A target version that re-mints identical definitions still repoints the
 * customer_entitlements' catalog claims: entitlement_id moves to the target's
 * rows while row identity and balances stay put — multi-item version of the
 * single-item test in core/basic-version-repoint, mixed with one changed item.
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
	`${chalk.yellowBright("batch version repoint transitions: unchanged-config entitlements repoint their claims")}`,
	async () => {
		const stem = `bvrt-claims-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 50 }),
				items.monthlyCredits({ includedUsage: 40 }),
			],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 20,
					timeout: 2_000,
				}),
			],
		});
		// Messages/Words identical across versions; Credits is the changed item.
		await mintPlanVersion({
			client: autumnV2_3,
			planId: plan.id,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
				itemsV2.monthlyCredits({ included: 60 }),
			],
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
		const wordsBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Words,
		});
		const creditsBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
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

		// Identical items: claim moves, row id and balance stable.
		const messagesAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(messagesAfter.id).toBe(messagesBefore.id);
		expect(messagesAfter.entitlement_id).not.toBe(
			messagesBefore.entitlement_id,
		);
		expect(messagesAfter.balance).toBe(80);
		const wordsAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Words,
		});
		expect(wordsAfter.id).toBe(wordsBefore.id);
		expect(wordsAfter.entitlement_id).not.toBe(wordsBefore.entitlement_id);
		expect(wordsAfter.balance).toBe(50);

		// The changed item still transitions normally alongside the repoints.
		const creditsAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(creditsAfter.id).toBe(creditsBefore.id);
		expect(creditsAfter.entitlement_id).not.toBe(creditsBefore.entitlement_id);
		expect(creditsAfter.balance).toBe(60);
	},
);
