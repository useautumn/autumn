import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectStripeSubscriptionCorrect } from "../../utils/expectStripeSubCorrect";

test.concurrent(`${chalk.yellowBright("multi-attach customize 1: different custom prices per plan")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const usersItem = items.monthlyUsers({ includedUsage: 10 });

	const planA = products.pro({ id: "plan-a", items: [messagesItem] });
	const planB = products.base({
		id: "plan-b",
		items: [usersItem, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-customize-prices",
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
				customize: {
					price: itemsV2.monthlyPrice({ amount: 35 }),
				},
			},
			{
				plan_id: planB.id,
				customize: {
					price: itemsV2.monthlyPrice({ amount: 50 }),
				},
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
		balance: 500,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 10,
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

test.concurrent(`${chalk.yellowBright("multi-attach customize 2: custom items per plan")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const addon = products.base({
		id: "addon",
		items: [messagesItem, items.monthlyPrice({ price: 20 })],
	});
	const planB = products.base({
		id: "plan-b",
		items: [messagesItem, items.monthlyPrice({ price: 20 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-customize-items",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,

		plans: [
			{
				plan_id: addon.id,
				customize: {
					price: null,
					items: [
						itemsV2.prepaidMessages({ included: 100, amount: 20 }),
						itemsV2.dashboard(),
					],
				},
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 300 },
				],
			},
			{
				plan_id: planB.id,
				customize: {
					price: null,
					items: [itemsV2.prepaidMessages({ included: 100, amount: 30 })],
				},
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 500 },
				],
			},
		],
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toEqual(40 + 120);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [addon.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 800,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40 + 120,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
