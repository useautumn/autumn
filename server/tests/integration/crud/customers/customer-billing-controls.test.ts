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

const usageAlertControls: CustomerBillingControls = {
	usage_alerts: [
		{
			feature_id: TestFeature.Messages,
			threshold: 90,
			threshold_type: "usage_percentage",
			enabled: true,
		},
	],
};

const overageAllowedControls: CustomerBillingControls = {
	overage_allowed: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
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

test.concurrent(`${chalk.yellowBright("customer billing controls: create customer with usage alerts")}`, async () => {
	const customerId = "customer-billing-controls-4";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Usage Alert Customer",
		email: `${customerId}@example.com`,
		billing_controls: usageAlertControls,
	});

	const cachedCustomer =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cachedCustomer.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);

	const uncachedCustomer = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(uncachedCustomer.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);

	const fromDb = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	expect(fromDb.usage_alerts).toEqual(usageAlertControls.usage_alerts);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: updating usage alerts does not unset spend limits or auto topups")}`, async () => {
	const customerId = "customer-billing-controls-5";
	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	// Set spend limits and auto topups first
	await autumnV2_1.customers.update(customerId, {
		billing_controls: spendLimitControls,
	});
	await autumnV2_1.customers.update(customerId, {
		billing_controls: autoTopupControls,
	});

	// Now update only usage_alerts
	await autumnV2_1.customers.update(customerId, {
		billing_controls: usageAlertControls,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
	expect(cached.billing_controls?.auto_topups).toEqual(
		autoTopupControls.auto_topups,
	);
	expect(cached.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
	expect(uncached.billing_controls?.auto_topups).toEqual(
		autoTopupControls.auto_topups,
	);
	expect(uncached.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: updating spend limits does not unset usage alerts")}`, async () => {
	const customerId = "customer-billing-controls-6";
	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	// Set usage alerts first
	await autumnV2_1.customers.update(customerId, {
		billing_controls: usageAlertControls,
	});

	// Now update only spend_limits
	await autumnV2_1.customers.update(customerId, {
		billing_controls: spendLimitControls,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);
	expect(cached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);
	expect(uncached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: clearing usage alerts with empty array")}`, async () => {
	const customerId = "customer-billing-controls-7";
	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	// Set both spend limits and usage alerts
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			...spendLimitControls,
			...usageAlertControls,
		},
	});

	// Clear only usage_alerts
	await autumnV2_1.customers.update(customerId, {
		billing_controls: { usage_alerts: [] },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.billing_controls?.usage_alerts).toEqual([]);
	expect(cached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.billing_controls?.usage_alerts).toEqual([]);
	expect(uncached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: create customer with overage_allowed")}`, async () => {
	const customerId = "customer-billing-controls-8";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Overage Allowed Customer",
		email: `${customerId}@example.com`,
		billing_controls: overageAllowedControls,
	});

	const cachedCustomer =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cachedCustomer.billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);

	const uncachedCustomer = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expect(uncachedCustomer.billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: update overage_allowed without clearing other billing controls")}`, async () => {
	const customerId = "customer-billing-controls-9";
	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: spendLimitControls,
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: overageAllowedControls,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
	expect(cached.billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
	expect(uncached.billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);
});

test.concurrent(`${chalk.yellowBright("customer billing controls: reject duplicate overage_allowed feature ids")}`, async () => {
	const customerId = "customer-billing-controls-10";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.customers.create({
				id: customerId,
				name: "Duplicate Overage Allowed",
				email: `${customerId}@example.com`,
				billing_controls: {
					overage_allowed: [
						{ feature_id: TestFeature.Messages, enabled: true },
						{ feature_id: TestFeature.Messages, enabled: false },
					],
				},
			}),
	});
});

test.concurrent(`${chalk.yellowBright("customer billing controls: clearing overage_allowed with empty array")}`, async () => {
	const customerId = "customer-billing-controls-11";
	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			...spendLimitControls,
			...overageAllowedControls,
		},
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: { overage_allowed: [] },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.billing_controls?.overage_allowed).toEqual([]);
	expect(cached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.billing_controls?.overage_allowed).toEqual([]);
	expect(uncached.billing_controls?.spend_limits).toEqual(
		spendLimitControls.spend_limits,
	);
});
