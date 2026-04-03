import { expect, test } from "bun:test";
import type { ApiCustomerV5, CheckResponseV3 } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";

test.concurrent(`${chalk.yellowBright("track-overage-allowed-1: free feature, enabled:true — usage exceeds granted (cache + db parity)")}`, async () => {
	const freeProd = products.base({
		id: "free-track-overage",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-overage-allowed-1",
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
		value: 130,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: cached,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 130,
	});

	await timeout(4000);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: uncached,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 130,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-2: free feature, no billing control (baseline) — usage caps at granted")}`, async () => {
	const freeProd = products.base({
		id: "free-track-no-control",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-overage-allowed-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 130,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 100,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-3: free feature, enabled:true, multiple tracks — usage grows past granted")}`, async () => {
	const freeProd = products.base({
		id: "free-track-multi",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-overage-allowed-3",
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
		value: 80,
	});

	let customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 20,
		usage: 80,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 130,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 70,
	});

	customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 200,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-4: overage_behavior:reject succeeds when overage_allowed is enabled")}`, async () => {
	const freeProd = products.base({
		id: "free-track-reject-allowed",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-overage-allowed-4",
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
		value: 50,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
		overage_behavior: "reject",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 80,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-5: send_event:true allowed when overage_allowed is enabled")}`, async () => {
	const freeProd = products.base({
		id: "free-track-send-event",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-overage-allowed-5",
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
		value: 50,
	});

	const checkResult = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 25,
		send_event: true,
	});
	expect(checkResult.allowed).toBe(true);

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 75,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-6: disabling overage_allowed reverts to capping at granted")}`, async () => {
	const freeProd = products.base({
		id: "free-track-disable",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-overage-allowed-6",
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

	let customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 120,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 120,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-7: lock + finalize with overage allowed — lock succeeds at 0, finalize confirm")}`, async () => {
	const freeProd = products.base({
		id: "free-lock-overage",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const customerId = "track-overage-allowed-7";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
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
		value: 50,
	});

	await deleteLock({ ctx, lockId: customerId });

	const checkResult = await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, lock_id: customerId },
	});
	expect(checkResult.allowed).toBe(true);

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 20,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: cached,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 70,
	});

	await timeout(4000);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: uncached,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 70,
	});
});

test.concurrent(`${chalk.yellowBright("track-overage-allowed-8: lock + finalize with override > lockValue — additional deduction beyond lock")}`, async () => {
	const freeProd = products.base({
		id: "free-lock-override",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const customerId = "track-overage-allowed-8";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await deleteLock({ ctx, lockId: customerId });

	const checkResult = await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, lock_id: customerId },
	});
	expect(checkResult.allowed).toBe(true);

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 80,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: cached,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 80,
	});

	await timeout(4000);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: uncached,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 80,
	});
});
