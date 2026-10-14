import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("multi-attach paid features: prepaid across two plans")}`, async () => {
	const prepaidMsgs = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const planA = products.pro({ id: "plan-a", items: [prepaidMsgs] });

	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		billingUnits: 100,
		price: 10,
		includedUsage: 0,
	});
	const planB = products.base({
		id: "plan-b",
		items: [prepaidWords, items.monthlyPrice({ price: 15 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-paid-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: planA.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			},
			{
				plan_id: planB.id,
				feature_quantities: [{ feature_id: TestFeature.Words, quantity: 300 }],
			},
		],
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(85, 0);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 300,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 85,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("multi-attach paid features: prepaid + consumable + allocated in separate plans")}`, async () => {
	const prepaidMsgs = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const planA = products.pro({ id: "plan-a", items: [prepaidMsgs] });

	const consumWords = items.consumableWords({ includedUsage: 100 });
	const allocUsers = items.allocatedUsers({ includedUsage: 3 });
	const planB = products.base({
		id: "plan-b",
		items: [consumWords, allocUsers, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-paid-combo",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: planA.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 500 },
				],
			},
			{ plan_id: planB.id },
		],
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(100, 0);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 3,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 100,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
