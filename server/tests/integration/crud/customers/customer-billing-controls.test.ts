import { expect, test } from "bun:test";
import type { ApiCustomerV5, CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const spendLimitControls: CustomerBillingControls = {
	spend_limits: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			overage_limit: 25,
		},
	],
};

const autoTopupControls: CustomerBillingControls = {
	auto_topups: [
		{
			feature_id: TestFeature.Credits,
			enabled: true,
			threshold: 20,
			quantity: 100,
		},
	],
};

test.concurrent(`${chalk.yellowBright("customer billing controls: create customer with spend limits")}`, async () => {
	const customerId = "customer-billing-controls-1";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Spend Limit Customer",
		email: `${customerId}@example.com`,
		billing_controls: spendLimitControls,
	});

	const cachedCustomer =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cachedCustomer.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);

	const uncachedCustomer = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expect(uncachedCustomer.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);

	const fromDb = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	expect(fromDb.spend_limits).toEqual(spendLimitControls.spend_limits);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: update spend limits without clearing other billing controls")}`, async () => {
	const customerId = "customer-billing-controls-2";
	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	await autumnV2_1.customers.update(customerId, {
		billing_controls: autoTopupControls,
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: spendLimitControls,
	});

	const afterSpendLimitUpdate =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(afterSpendLimitUpdate.billing_controls?.auto_topups).toEqual(
		autoTopupControls.auto_topups,
	);
	expect(afterSpendLimitUpdate.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);

	await autumnV2_1.customers.update(customerId, {
		billing_controls: { spend_limits: [] },
	});

	const cachedCustomer =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cachedCustomer.billing_controls?.auto_topups).toEqual(
		autoTopupControls.auto_topups,
	);
	expect(cachedCustomer.billing_controls?.spend_limits).toEqual([]);

	const uncachedCustomer = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expect(uncachedCustomer.billing_controls?.auto_topups).toEqual(
		autoTopupControls.auto_topups,
	);
	expect(uncachedCustomer.billing_controls?.spend_limits).toEqual([]);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: reject duplicate spend limit feature ids on create and update")}`, async () => {
	const customerId = "customer-billing-controls-3";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.customers.create({
				id: customerId,
				name: "Duplicate Spend Limit Create",
				email: `${customerId}@example.com`,
				billing_controls: {
					spend_limits: [
						{
							feature_id: TestFeature.Messages,
							enabled: true,
							overage_limit: 10,
						},
						{
							feature_id: TestFeature.Messages,
							enabled: false,
							overage_limit: 20,
						},
					],
				},
			}),
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Duplicate Spend Limit Update",
		email: `${customerId}@example.com`,
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.customers.update(customerId, {
				billing_controls: {
					spend_limits: [
						{
							feature_id: TestFeature.Credits,
							enabled: true,
							overage_limit: 15,
						},
						{
							feature_id: TestFeature.Credits,
							enabled: true,
							overage_limit: 30,
						},
					],
				},
			}),
	});
});
