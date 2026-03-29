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

// ─────────────────────────────────────────────────────────────────
// Unlimited rollover — repeated lazy resets
//
// Verify that rollovers accumulate linearly, NOT exponentially.
// Each cycle should roll over only cusEnt.balance (the main balance),
// not the sum of main + existing rollovers.
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("unlimited rollover: repeated lazy resets accumulate linearly")}`, async () => {
	const includedUsage = 200;

	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage,
		rolloverConfig: {
			length: 0,
			duration: RolloverExpiryDurationType.Forever,
		},
	});
	const free = products.base({ id: "free-unlimited-roll", items: [messagesItem] });

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "rollover-unlimited-repeat",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
		],
	});

	await timeout(2000);

	// Cycle 0: no usage. balance = 200, rollovers = []
	const cycle0 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: cycle0,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
	});

	// ── Reset 1 ──────────────────────────────────────────────────
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const cycle1 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	// Rollover from main = 200, fresh grant = 200 → total = 400
	expectBalanceCorrect({
		customer: cycle1,
		featureId: TestFeature.Messages,
		remaining: 400,
		usage: 0,
		rollovers: [{ balance: 200 }],
	});

	// ── Reset 2 ──────────────────────────────────────────────────
	await timeout(1000);
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const cycle2 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	// New rollover should be 200 (only main balance), NOT 400 (main + previous rollover)
	// Rollovers: [200, 200], fresh grant = 200 → total = 600
	expectBalanceCorrect({
		customer: cycle2,
		featureId: TestFeature.Messages,
		remaining: 600,
		usage: 0,
		rollovers: [{ balance: 200 }, { balance: 200 }],
	});

	// ── Reset 3 ──────────────────────────────────────────────────
	await timeout(1000);
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const cycle3 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	// New rollover should be 200 again, NOT 600
	// Rollovers: [200, 200, 200], fresh grant = 200 → total = 800
	expectBalanceCorrect({
		customer: cycle3,
		featureId: TestFeature.Messages,
		remaining: 800,
		usage: 0,
		rollovers: [{ balance: 200 }, { balance: 200 }, { balance: 200 }],
	});

	// Also verify from cache
	const cached = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: cached,
		featureId: TestFeature.Messages,
		remaining: 800,
		usage: 0,
		rollovers: [{ balance: 200 }, { balance: 200 }, { balance: 200 }],
	});
});

test.concurrent(`${chalk.yellowBright("unlimited rollover: with partial usage, only main balance rolls over")}`, async () => {
	const includedUsage = 200;

	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage,
		rolloverConfig: {
			length: 0,
			duration: RolloverExpiryDurationType.Forever,
		},
	});
	const free = products.base({ id: "free-unlimited-usage", items: [messagesItem] });

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "rollover-unlimited-usage",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 80, timeout: 2000 }),
		],
	});

	// Cycle 0: used 80, remaining = 120
	const cycle0 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: cycle0,
		featureId: TestFeature.Messages,
		remaining: 120,
		usage: 80,
	});

	// ── Reset 1 ──────────────────────────────────────────────────
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const cycle1 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	// Main balance was 120 (200 - 80 usage) → rollover = 120
	// Fresh grant = 200 → total = 200 + 120 = 320
	expectBalanceCorrect({
		customer: cycle1,
		featureId: TestFeature.Messages,
		remaining: 320,
		usage: 0,
		rollovers: [{ balance: 120 }],
	});

	// ── Reset 2 (no usage in cycle 2) ────────────────────────────
	await timeout(1000);
	await expireCusEntForReset({ ctx, customerId, featureId: TestFeature.Messages });

	const cycle2 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	// Main balance was 200 (full grant, no usage in cycle 2) → rollover = 200
	// Rollovers: [120, 200], fresh grant = 200 → total = 200 + 120 + 200 = 520
	expectBalanceCorrect({
		customer: cycle2,
		featureId: TestFeature.Messages,
		remaining: 520,
		usage: 0,
		rollovers: [{ balance: 120 }, { balance: 200 }],
	});
});
