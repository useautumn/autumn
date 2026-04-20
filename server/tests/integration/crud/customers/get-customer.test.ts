import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiCustomerSchema,
	type AttachParamsV1Input,
	CustomerExpand,
} from "@autumn/shared";
import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
} from "@shared/api/customers/apiCustomerV5";
import {
	type ApiCustomerV3,
	ApiCustomerV3Schema,
} from "@shared/api/customers/previousVersions/apiCustomerV3";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Multi-entity comparison tests (V2 cache baseline)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("get-customer: multi-entity customer returns correct balances across API versions")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 200 });

	const cusLevelProd = products.pro({
		id: "cus-lvl",
		items: [dashboardItem, messagesItem],
	});
	const entityProd = products.base({
		id: "ent-prod",
		items: [creditsItem],
	});

	const customerId = "get-cus-multi-ent-v2";

	const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [cusLevelProd, entityProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: cusLevelProd.id }),
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
			s.track({ featureId: TestFeature.Messages, value: 10 }),
		],
	});

	// V1 (v1.2) -- products[] + features{} shape (ApiCustomerV3)
	const cusV1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	ApiCustomerV3Schema.parse(cusV1);
	expect(cusV1.products.length).toBeGreaterThan(0);
	const cusV1Prod = cusV1.products[0];
	expect(cusV1Prod.current_period_start).toBeNumber();
	expect(cusV1Prod.current_period_end).toBeNumber();
	expect(cusV1.features[TestFeature.Messages]).toMatchObject({
		id: TestFeature.Messages,
		balance: 90,
		usage: 10,
		included_usage: 100,
	});
	expect(cusV1.features[TestFeature.Dashboard]).toMatchObject({
		id: TestFeature.Dashboard,
	});

	// V2.1 -- subscriptions (single array), flags split out, balances use V1 shape
	const cusV2_1 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		keepInternalFields: true,
	});
	ApiCustomerV5Schema.parse(cusV2_1);
	expect(cusV2_1.subscriptions.length).toBeGreaterThan(0);
	const cusV2_1Sub = cusV2_1.subscriptions[0];
	expect(cusV2_1Sub.current_period_start).toBeNumber();
	expect(cusV2_1Sub.current_period_end).toBeNumber();
	expectFlagCorrect({
		customer: cusV2_1,
		featureId: TestFeature.Dashboard,
		planId: cusLevelProd.id,
		expiresAt: null,
	});
	expectBalanceCorrect({
		customer: cusV2_1,
		featureId: TestFeature.Messages,
		remaining: 90,
		usage: 10,
		planId: cusLevelProd.id,
	});
	expect(cusV2_1.balances[TestFeature.Dashboard]).toBeUndefined();

	// V2.2 -- same shape as v2.1
	const cusV2_2 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		keepInternalFields: true,
	});
	ApiCustomerV5Schema.parse(cusV2_2);
	expect(cusV2_2.subscriptions.length).toBeGreaterThan(0);
	const cusV2_2Sub = cusV2_2.subscriptions[0];
	expect(cusV2_2Sub.current_period_start).toBeNumber();
	expect(cusV2_2Sub.current_period_end).toBeNumber();
	expectFlagCorrect({
		customer: cusV2_2,
		featureId: TestFeature.Dashboard,
		planId: cusLevelProd.id,
		expiresAt: null,
	});
	expectBalanceCorrect({
		customer: cusV2_2,
		featureId: TestFeature.Messages,
		remaining: 90,
		usage: 10,
		planId: cusLevelProd.id,
	});

	const refDir = `${import.meta.dir}/../../../references`;
	await Bun.write(
		`${refDir}/getCustomerV1Response.json`,
		JSON.stringify(cusV1, null, 2),
	);
	await Bun.write(
		`${refDir}/getCustomerV2_1Response.json`,
		JSON.stringify(cusV2_1, null, 2),
	);
	await Bun.write(
		`${refDir}/getCustomerV2_2Response.json`,
		JSON.stringify(cusV2_2, null, 2),
	);
});

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

test.concurrent(`${chalk.yellowBright("get-customer: customer cache updates after entity attach")}`, async () => {
	const creditsItem = items.monthlyCredits({ includedUsage: 200 });
	const entityProd = products.base({
		id: "get-customer-entity-attach",
		items: [creditsItem],
	});
	const customerId = "get-customer-after-entity-attach";

	const { autumnV2_2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [entityProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const beforeAttach = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{
			keepInternalFields: true,
		},
	);
	ApiCustomerV5Schema.parse(beforeAttach);
	expect(beforeAttach.balances[TestFeature.Credits]).toBeUndefined();

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: entityProd.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	const afterAttach = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{
			keepInternalFields: true,
		},
	);

	ApiCustomerV5Schema.parse(afterAttach);
	expectBalanceCorrect({
		customer: afterAttach,
		featureId: TestFeature.Credits,
		remaining: 200,
		usage: 0,
		// planId: null,
	});
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
