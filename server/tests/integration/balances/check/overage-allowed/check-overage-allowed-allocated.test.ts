import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";

test.concurrent(`${chalk.yellowBright("check-allocated-overage-1: free allocated, enabled:true, check at 0 balance — allowed:true")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-check",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-alloc-overage-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Users,
		enabled: true,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		required_balance: 1,
	});
	expect(check.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-allocated-overage-2: free allocated, no control (baseline) — allowed:false at 0")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-check-base",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-alloc-overage-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-allocated-overage-3: free allocated, enabled:false after overage — allowed:false")}`, async () => {
	const freeProd = products.base({
		id: "free-alloc-check-disable",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-alloc-overage-3",
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
		value: 7,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Users,
		enabled: false,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});
