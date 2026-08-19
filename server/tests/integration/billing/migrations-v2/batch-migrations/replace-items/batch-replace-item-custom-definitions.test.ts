import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import {
	readScopedFeatureRow,
	repointToCustomEntitlement,
} from "../paidRowTestUtils";

const ORIGINAL_ALLOWANCE = 100;
const REPLACEMENT_ALLOWANCE = 200;
const DIFFERENT_ALLOWANCE = 500;

test(`${chalk.yellowBright("batch replace_item: matches custom definitions by meaning")}`, async () => {
	const sameMeaningCustomerId = "batch-replace-item-custom-same";
	const differentMeaningCustomerId = "batch-replace-item-custom-different";
	const plan = products.base({
		id: "batch-replace-item-custom-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: ORIGINAL_ALLOWANCE }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: sameMeaningCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: differentMeaningCustomerId }]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: plan.id }),
				s.attach({
					customerId: differentMeaningCustomerId,
					productId: plan.id,
				}),
			),
		],
	});

	await repointToCustomEntitlement({
		ctx,
		customerId: sameMeaningCustomerId,
		featureId: TestFeature.Messages,
	});
	await repointToCustomEntitlement({
		ctx,
		customerId: differentMeaningCustomerId,
		featureId: TestFeature.Messages,
		overrides: { allowance: DIFFERENT_ALLOWANCE },
	});

	const sameMeaningBefore = await readScopedFeatureRow({
		ctx,
		customerId: sameMeaningCustomerId,
		featureId: TestFeature.Messages,
	});
	const differentMeaningBefore = await readScopedFeatureRow({
		ctx,
		customerId: differentMeaningCustomerId,
		featureId: TestFeature.Messages,
	});
	await ctx.db
		.update(customerEntitlements)
		.set({ balance: DIFFERENT_ALLOWANCE })
		.where(eq(customerEntitlements.id, differentMeaningBefore.id));
	const differentMeaningCustomized = {
		...differentMeaningBefore,
		balance: DIFFERENT_ALLOWANCE,
	};

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-item-custom-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [
							itemsV2.monthlyMessages({
								included: REPLACEMENT_ALLOWANCE,
							}),
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

	const sameMeaningAfter = await readScopedFeatureRow({
		ctx,
		customerId: sameMeaningCustomerId,
		featureId: TestFeature.Messages,
	});
	expect(sameMeaningAfter.id).toBe(sameMeaningBefore.id);
	expect(sameMeaningAfter.entitlement_id).not.toBe(
		sameMeaningBefore.entitlement_id,
	);
	expect(sameMeaningAfter.balance).toBe(REPLACEMENT_ALLOWANCE);

	const differentMeaningAfter = await readScopedFeatureRow({
		ctx,
		customerId: differentMeaningCustomerId,
		featureId: TestFeature.Messages,
	});
	expect(differentMeaningAfter).toEqual(differentMeaningCustomized);
});
