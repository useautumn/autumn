import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CustomerBillingControls,
	CustomerExpand,
	PurchaseLimitInterval,
} from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const AUTO_TOPUP_WAIT_MS = 20000;

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

test.concurrent(`${chalk.yellowBright("customer billing controls: auto_topups.purchase_limit expand surfaces runtime tracking")}`, async () => {
	/**
	 * Exercises the new `expand=billing_controls.auto_topups.purchase_limit`
	 * path through three branches:
	 *
	 *   Phase A — purchase_limit configured, no DB row yet
	 *             → expand is a passthrough (no count / next_reset_at)
	 *   Phase B — purchase_limit configured, top-up has fired
	 *             → expand surfaces count + next_reset_at; non-expanded fetch
	 *               must NOT include them; uncached path matches cached
	 *   Phase C — purchase_limit removed from config, prior row persists
	 *             → expand returns null for interval/interval_count/limit but
	 *               continues to surface count + next_reset_at from the row
	 *
	 * Phase C asserts `count: 1` (carried over from Phase B's top-up).
	 * Removing `purchase_limit` from config does not delete the row, but
	 * `recordAutoTopupAttempt` only increments `purchase_count` when
	 * `purchaseLimit` is configured — so subsequent top-ups don't advance the
	 * counter. The runtime field reflects this honestly: an attempt without a
	 * configured limit is, definitionally, not "consumed against a quota."
	 */
	const customerId = "customer-billing-controls-12";
	const oneOffProd = products.oneOffAddOn({
		id: "topup-expand",
		items: [
			items.oneOffMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { autumnV2_1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
		],
	});

	// ── Phase A: purchase_limit configured, no DB row yet → expand is a
	// passthrough of the static config shape.
	await autumnV2_2.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 50,
			quantity: 100,
			purchaseLimit: { interval: PurchaseLimitInterval.Month, limit: 5 },
		}),
	});

	const phaseA = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.AutoTopupsPurchaseLimit],
	});
	const phaseAPurchaseLimit =
		phaseA.billing_controls?.auto_topups?.[0]?.purchase_limit;
	expect(phaseAPurchaseLimit).toEqual({
		interval: PurchaseLimitInterval.Month,
		interval_count: 1,
		limit: 5,
	});
	expect(phaseAPurchaseLimit).not.toHaveProperty("count");
	expect(phaseAPurchaseLimit).not.toHaveProperty("next_reset_at");

	// ── Phase B: track usage to fire one auto top-up, then assert expand
	// returns the runtime count + window end.
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 260,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const phaseBExpanded = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{ expand: [CustomerExpand.AutoTopupsPurchaseLimit] },
	);
	const phaseBPurchaseLimit = phaseBExpanded.billing_controls?.auto_topups?.[0]
		?.purchase_limit as
		| {
				interval: PurchaseLimitInterval | null;
				interval_count: number | null;
				limit: number | null;
				count: number;
				next_reset_at: number;
		  }
		| undefined;
	expect(phaseBPurchaseLimit).toMatchObject({
		interval: PurchaseLimitInterval.Month,
		interval_count: 1,
		limit: 5,
		count: 1,
	});
	expect(typeof phaseBPurchaseLimit?.next_reset_at).toBe("number");
	expect(phaseBPurchaseLimit?.next_reset_at).toBeGreaterThan(Date.now());

	// Without the expand the runtime fields must not leak in, even though the
	// DB row now exists.
	const phaseBPlain = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const phaseBPlainPurchaseLimit =
		phaseBPlain.billing_controls?.auto_topups?.[0]?.purchase_limit;
	expect(phaseBPlainPurchaseLimit).toEqual({
		interval: PurchaseLimitInterval.Month,
		interval_count: 1,
		limit: 5,
	});
	expect(phaseBPlainPurchaseLimit).not.toHaveProperty("count");
	expect(phaseBPlainPurchaseLimit).not.toHaveProperty("next_reset_at");

	// skip_cache parity — uncached read should match the cached expanded read.
	const phaseBUncached = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{
			expand: [CustomerExpand.AutoTopupsPurchaseLimit],
			skip_cache: "true",
		},
	);
	expect(
		phaseBUncached.billing_controls?.auto_topups?.[0]?.purchase_limit,
	).toEqual(phaseBPurchaseLimit);

	// ── Phase C: drop purchase_limit from config; the existing DB row keeps
	// tracking. Expand should report null config fields plus the cumulative
	// runtime count.
	await autumnV2_2.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({ threshold: 50, quantity: 100 }),
	});
	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const phaseC = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.AutoTopupsPurchaseLimit],
	});
	const phaseCPurchaseLimit = phaseC.billing_controls?.auto_topups?.[0]
		?.purchase_limit as
		| {
				interval: PurchaseLimitInterval | null;
				interval_count: number | null;
				limit: number | null;
				count: number;
				next_reset_at: number;
		  }
		| undefined;
	expect(phaseCPurchaseLimit).toMatchObject({
		interval: null,
		interval_count: null,
		limit: null,
		// count stays at 1 — see header comment: Phase C's top-up fires but
		// does not increment purchase_count because no purchase_limit is
		// configured.
		count: 1,
	});
	expect(typeof phaseCPurchaseLimit?.next_reset_at).toBe("number");
});
