import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { normalizeCheckResponse } from "../../utils/spend-limit-utils/checkSpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("check-overage-allowed-1: free feature, enabled:true, balance at 0 — check returns allowed:true")}`, async () => {
	const freeProd = products.base({
		id: "free-overage-check",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-overage-allowed-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const beforeControl = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(beforeControl.allowed).toBe(false);

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	const afterControl = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(afterControl.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-overage-allowed-2: free feature, enabled:true, balance negative — check still returns allowed:true")}`, async () => {
	const freeProd = products.base({
		id: "free-overage-neg",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-overage-allowed-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 50,
	});
	expect(check.allowed).toBe(true);
	expect(check.balance!.remaining).toBeLessThan(0);
});

test.concurrent(`${chalk.yellowBright("check-overage-allowed-3: free feature, no billing control (baseline) — check returns allowed:false at 0")}`, async () => {
	const freeProd = products.base({
		id: "free-no-control",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-overage-allowed-3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-overage-allowed-4: check with send_event:true, enabled:true — allowed:true and balance goes negative")}`, async () => {
	const freeProd = products.base({
		id: "free-overage-send-event",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-overage-allowed-4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const checkResult = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 25,
		send_event: true,
	});
	expect(checkResult.allowed).toBe(true);
	expect(checkResult.balance!.remaining).toBe(-25);
});

test.concurrent(`${chalk.yellowBright("check-overage-allowed-5: cache/DB parity — cached and uncached check responses match")}`, async () => {
	const freeProd = products.base({
		id: "free-overage-parity",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-overage-allowed-5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 120,
	});

	const cached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 10,
	});
	expect(cached.allowed).toBe(true);

	await timeout(4000);

	const uncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 10,
		skip_cache: true,
	});

	expect(normalizeCheckResponse(uncached)).toEqual(
		normalizeCheckResponse(cached),
	);
});
