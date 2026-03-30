import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";

test.concurrent(`${chalk.yellowBright("track-allocated-overage-1: free allocated, enabled:true, usage exceeds granted")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-overage",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-alloc-overage-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Users,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 0,
		usage: 8,
	});
});

test.concurrent(`${chalk.yellowBright("track-allocated-overage-2: free allocated, enabled:true, overage_behavior:reject succeeds")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-reject",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-alloc-overage-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Users,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
		overage_behavior: "reject",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 0,
		usage: 8,
	});
});

test.concurrent(`${chalk.yellowBright("track-allocated-overage-3: free allocated, no control (baseline) — usage caps at granted")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-baseline",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-alloc-overage-3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 0,
		usage: 8,
	});
});

test.concurrent(`${chalk.yellowBright("track-allocated-overage-4: free allocated, enabled:false after overage — no further deduction")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-disable",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-alloc-overage-4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Users,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	let customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 0,
		usage: 8,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Users,
		enabled: false,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 0,
		usage: 8,
	});
});
