import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectCustomerEntitlementRowCount } from "../batchTestUtils";

const MESSAGES_INCLUDED = 100;

test(`${chalk.yellowBright("batch plan-item delete: a version-less delete reaches every plan version")}`, async () => {
	const v1CustomerId = "bpid-delete-versions-v1";
	const v2CustomerId = "bpid-delete-versions-v2";
	const plan = products.base({
		id: "bpid-delete-versions-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV1, autumnV2_3 } = await initScenario({
		customerId: v1CustomerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await autumnV1.products.update(plan.id, {
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	await autumnV1.customers.create({ id: v2CustomerId });
	await autumnV2_3.billing.attach({
		customer_id: v2CustomerId,
		plan_id: plan.id,
	});

	for (const customerId of [v1CustomerId, v2CustomerId]) {
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
	}

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_3,
		migrationId: "bpid-delete-versions-migration",
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

	expect(result?.lane).toBe("batch");

	for (const customerId of [v1CustomerId, v2CustomerId]) {
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 0,
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
