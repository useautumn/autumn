import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const ORIGINAL_ALLOWANCE = 100;
const REPLACEMENT_ALLOWANCE = 200;

test(`${chalk.yellowBright("batch replace_item: version-less replace reaches v1 and v2 customers")}`, async () => {
	const v1CustomerId = "batch-replace-item-versions-v1";
	const v2CustomerId = "batch-replace-item-versions-v2";
	const plan = products.base({
		id: "batch-replace-item-versions-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: ORIGINAL_ALLOWANCE }),
		],
	});

	const { ctx, autumnV1, autumnV2_2 } = await initScenario({
		customerId: v1CustomerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await autumnV1.products.update(plan.id, {
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: ORIGINAL_ALLOWANCE }),
		],
	});
	await autumnV1.customers.create({ id: v2CustomerId });
	await autumnV2_2.billing.attach({
		customer_id: v2CustomerId,
		plan_id: plan.id,
	});

	const rowsBefore = new Map(
		await Promise.all(
			[v1CustomerId, v2CustomerId].map(
				async (customerId) =>
					[
						customerId,
						await readScopedFeatureRow({
							ctx,
							customerId,
							featureId: TestFeature.Messages,
						}),
					] as const,
			),
		),
	);

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-item-versions-migration",
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

	for (const customerId of [v1CustomerId, v2CustomerId]) {
		const before = rowsBefore.get(customerId);
		if (!before)
			throw new Error(`Expected a pre-migration row for ${customerId}`);
		const after = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(after.id).toBe(before.id);
		expect(after.entitlement_id).not.toBe(before.entitlement_id);
		expect(after.balance).toBe(REPLACEMENT_ALLOWANCE);

		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Dashboard,
			count: 1,
		});
	}
});
