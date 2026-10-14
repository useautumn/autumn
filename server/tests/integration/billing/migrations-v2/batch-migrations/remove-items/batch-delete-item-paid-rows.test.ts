import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../batchTestUtils";
import {
	attachCustomerPaidPrice,
	expectCustomerPriceSurvives,
	repointToCustomEntitlement,
} from "../paidRowTestUtils";

const MESSAGES_INCLUDED = 100;
const PLAN_PREFIX = "batch-delete-paid";

test(`${chalk.yellowBright("batch migration: a delete spares rows the customer pays for")}`, async () => {
	const catalogCustomerId = "batch-delete-paid-catalog";
	const sharedPaidCustomerId = "batch-delete-paid-shared";
	const customPaidCustomerId = "batch-delete-paid-custom";
	const plan = products.base({
		id: "batch-delete-paid-plan",
		items: [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: MESSAGES_INCLUDED }),
		],
	});
	const paidTemplate = products.base({
		id: "batch-delete-paid-template",
		items: [items.consumableMessages()],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: catalogCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([
				{ id: sharedPaidCustomerId },
				{ id: customPaidCustomerId },
			]),
			s.products({ list: [plan, paidTemplate], prefix: PLAN_PREFIX }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: plan.id }),
				s.attach({
					customerId: sharedPaidCustomerId,
					productId: plan.id,
				}),
				s.attach({
					customerId: customPaidCustomerId,
					productId: plan.id,
				}),
			),
		],
	});
	const planId = plan.id;

	const sharedPaid = await attachCustomerPaidPrice({
		ctx,
		customerId: sharedPaidCustomerId,
		featureId: TestFeature.Messages,
		templatePlanId: paidTemplate.id,
	});

	await repointToCustomEntitlement({
		ctx,
		customerId: customPaidCustomerId,
		featureId: TestFeature.Messages,
	});
	const customPaid = await attachCustomerPaidPrice({
		ctx,
		customerId: customPaidCustomerId,
		featureId: TestFeature.Messages,
		templatePlanId: paidTemplate.id,
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-paid-migration",
		filter: { customer: { plan: { plan_id: planId, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: planId, custom: false },
					customize: {
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
			(r) => `${r.code}: ${r.message}`,
		),
	}).toEqual({ lane: "batch", rejections: [] });

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId: catalogCustomerId,
		planId,
		featureId: TestFeature.Messages,
		count: 0,
	});

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId: sharedPaidCustomerId,
		planId,
		featureId: TestFeature.Messages,
		count: 1,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId: customPaidCustomerId,
		planId,
		featureId: TestFeature.Messages,
		count: 1,
	});
	await expectCustomerPriceSurvives({
		ctx,
		customerPriceId: sharedPaid.customerPriceId,
	});
	await expectCustomerPriceSurvives({
		ctx,
		customerPriceId: customPaid.customerPriceId,
	});
});
