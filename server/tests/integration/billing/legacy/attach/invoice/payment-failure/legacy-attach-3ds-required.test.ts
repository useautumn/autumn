import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceConfirmationV2 as completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmationV2";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-3ds 1: new subscription")}`, async () => {
	const customerId = "legacy-3ds-new";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "authenticate" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(res.checkout_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customerAfter as any, product: pro });

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-3ds 2: upgrade")}`, async () => {
	const customerId = "legacy-3ds-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 500,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(res.checkout_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerBefore as any,
		product: pro,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerAfter as any,
		product: premium,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-3ds 3: merged add-on")}`, async () => {
	const customerId = "legacy-3ds-merged";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addOnMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const addOnPriceItem = items.monthlyPrice({ price: 10 });
	const addOn = products.base({
		id: "monthly-addon",
		isAddOn: true,
		items: [addOnMessagesItem, addOnPriceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
	});

	expect(res.checkout_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerBefore as any,
		product: pro,
	});
	expectProductNotAttached({
		customer: customerBefore as any,
		product: addOn,
	});

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerAfter as any,
		product: pro,
	});
	expectProductAttached({
		customer: customerAfter as any,
		product: addOn,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-3ds 4: update quantity")}`, async () => {
	const customerId = "legacy-3ds-qty";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const initialQuantityV1 = 300;
	const initialTotalBalance = 100 + initialQuantityV1;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantityV1,
					},
				],
			}),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const customerInit = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerInit,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});

	const updatedQuantityV1 = 500;

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: updatedQuantityV1,
			},
		],
	});

	expect(res.checkout_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const updatedTotalBalance = 100 + updatedQuantityV1;

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: updatedTotalBalance,
		balance: updatedTotalBalance,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
