import { expect, test } from "bun:test";
import { type ApiCustomerV5, RolloverExpiryDurationType } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("free rollover max_percentage (lazy reset): caps at percentage of included")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 200,
		rolloverConfig: {
			max_percentage: 50,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({ id: "free-pct-lazy", items: [messagesItem] });

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "rollover-pct-lazy",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
		],
	});

	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: before,
		featureId: TestFeature.Messages,
		remaining: 150,
		usage: 50,
	});

	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const afterDb = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: afterDb,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		rollovers: [{ balance: 100 }],
	});

	const afterCache = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCache,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		rollovers: [{ balance: 100 }],
	});
});

test.concurrent(`${chalk.yellowBright("free rollover max_percentage (lazy reset): no capping when unused below cap")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 200,
		rolloverConfig: {
			max_percentage: 50,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({ id: "free-pct-lazy-under", items: [messagesItem] });

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "rollover-pct-lazy-under",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
		],
	});

	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const afterDb = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: afterDb,
		featureId: TestFeature.Messages,
		remaining: 250,
		usage: 0,
		rollovers: [{ balance: 50 }],
	});

	const afterCache = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCache,
		featureId: TestFeature.Messages,
		remaining: 250,
		usage: 0,
		rollovers: [{ balance: 50 }],
	});
});

test.concurrent(`${chalk.yellowBright("free rollover max_percentage (cron reset): caps at percentage of included")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 200,
		rolloverConfig: {
			max_percentage: 50,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({ id: "free-pct-cron", items: [messagesItem] });

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "rollover-pct-cron",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		rollovers: [{ balance: 100 }],
	});
});

test.concurrent(`${chalk.yellowBright("free rollover max_percentage (lazy reset): multi-cycle accumulation capped")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
		rolloverConfig: {
			max_percentage: 50,
			length: 3,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({ id: "free-pct-multi", items: [messagesItem] });

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "rollover-pct-multi",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 60, timeout: 2000 }),
		],
	});

	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const afterCycle1 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: afterCycle1,
		featureId: TestFeature.Messages,
		remaining: 140,
		rollovers: [{ balance: 40 }],
	});

	await timeout(1000);
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const afterCycle2 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: afterCycle2,
		featureId: TestFeature.Messages,
		remaining: 150,
	});
});

test.concurrent(`${chalk.yellowBright("free rollover max_percentage (lazy reset): 100% allows full rollover")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 200,
		rolloverConfig: {
			max_percentage: 100,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({ id: "free-pct-full", items: [messagesItem] });

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "rollover-pct-full",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await timeout(2000);
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const afterDb = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: afterDb,
		featureId: TestFeature.Messages,
		remaining: 400,
		usage: 0,
		rollovers: [{ balance: 200 }],
	});

	const afterCache = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCache,
		featureId: TestFeature.Messages,
		remaining: 400,
		usage: 0,
		rollovers: [{ balance: 200 }],
	});
});
