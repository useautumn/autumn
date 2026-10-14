import { expect, test } from "bun:test";
import type { ApiCustomerV1, ApiCustomerV3 } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-addon 1: attach pro then free add-on with messages")}`, async () => {
	const customerId = "legacy-addon-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const addOnMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const addOn = products.base({
		id: "addon",
		items: [addOnMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addOn.id }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-addon 2: attach pro then free add-on twice")}`, async () => {
	const customerId = "legacy-addon-2";

	const pro = products.pro({ id: "pro", items: [] });

	const creditsItem = items.monthlyCredits();
	const addOn = products.base({
		id: "addon",
		items: [creditsItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addOn.id }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Credits,
		balance: 100,
		usage: 0,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id, addOn.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Credits,
		balance: 200,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-addon 3: attach pro then monthly prepaid add-on with quantity")}`, async () => {
	const customerId = "legacy-addon-3";
	const monthlyQuantity = 500;

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const prepaidMessagesItem = items.prepaidMessages({
		price: 9,
		billingUnits: 250,
		includedUsage: 0,
	});
	const addOn = products.base({
		id: "monthly-add-on",
		items: [prepaidMessagesItem],
		isAddOn: true,
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await AutumnCli.attach({
		customerId,
		productId: addOn.id,
		forceCheckout: false,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: monthlyQuantity,
			},
		],
	});

	const cusRes = (await AutumnCli.getCustomer(customerId)) as ApiCustomerV1;

	const expectedBalance = 10 + monthlyQuantity;

	const monthlyMessagesBalance = cusRes.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
	);
	expect(monthlyMessagesBalance?.balance).toBe(expectedBalance);

	expect(cusRes.add_ons).toHaveLength(1);
	const monthlyAddOnFound = cusRes.add_ons.find((a) => a.id === addOn.id);
	expect(monthlyAddOnFound).toBeDefined();

	expect(cusRes.invoices.length).toBe(2);

	const entitledRes = (await AutumnCli.entitled(
		customerId,
		TestFeature.Messages,
	)) as {
		allowed: boolean;
		balances: { feature_id: string; balance: number }[];
	};
	const messagesBalance = entitledRes.balances.find(
		(b) => b.feature_id === TestFeature.Messages,
	);
	expect(messagesBalance?.balance).toBe(expectedBalance);
});
