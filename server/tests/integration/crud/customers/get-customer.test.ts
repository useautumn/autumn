import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiCustomerSchema,
	CustomerExpand,
} from "@autumn/shared";
import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
} from "@shared/api/customers/apiCustomerV5";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("get-customer: expand empty array returns items")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const customerId = "get-customer-expand-empty";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customer = await autumnV1.customers.create({
		id: customerId,
		expand: [],
	});

	expect(customer.products).toBeDefined();
	expect(customer.products.length).toBeGreaterThan(0);
	expect(customer.products[0].items).toBeDefined();
	expect(customer.products[0].items!.length).toBeGreaterThan(0);
});

test.concurrent(`${chalk.yellowBright("get-customer: v2.1 returns boolean features in flags")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "flags-pro",
		items: [dashboardItem, messagesItem],
	});

	const customerId = "get-customer-flags-v2-1";

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.FlagsFeature],
		keepInternalFields: true,
	});

	ApiCustomerV5Schema.parse(customer);
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
		expiresAt: null,
		withFeature: true,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		planId: pro.id,
	});
	expect(customer.balances[TestFeature.Dashboard]).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("get-customer: v2 returns boolean features in balances")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "flags-pro-v2",
		items: [dashboardItem, messagesItem],
	});

	const customerId = "get-customer-flags-v2";

	const { autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

	ApiCustomerSchema.parse(customer);
	expect(customer.balances[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: pro.id,
		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,
		overage_allowed: false,
		max_purchase: null,
		reset: null,
	});
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		feature_id: TestFeature.Messages,
		plan_id: pro.id,
		granted_balance: 100,
		purchased_balance: 0,
		current_balance: 100,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("get-customer: created boolean balance is returned as flag with expires_at")}`, async () => {
	const customerId = "get-customer-created-flag-v2-1";
	const expiresAt = Date.now() + 60_000;

	const { autumnV2, autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
		expires_at: expiresAt,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		keepInternalFields: true,
	});

	ApiCustomerV5Schema.parse(customer);
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: null,
		expiresAt,
	});
	expect(customer.balances[TestFeature.Dashboard]).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("get-customer: v2 balances.feature also expands flag features")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "flags-pro-v2-expand",
		items: [dashboardItem, messagesItem],
	});

	const customerId = "get-customer-flags-v2-expand";

	const { autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
		expand: [CustomerExpand.BalancesFeature],
		keepInternalFields: true,
	});

	ApiCustomerSchema.parse(customer);
	expect(customer.balances[TestFeature.Dashboard].feature?.id).toBe(
		TestFeature.Dashboard,
	);
	expect(customer.balances[TestFeature.Messages].feature?.id).toBe(
		TestFeature.Messages,
	);
});
