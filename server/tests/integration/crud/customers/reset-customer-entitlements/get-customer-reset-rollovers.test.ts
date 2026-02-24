import { expect, test } from "bun:test";
import { type ApiCustomer, RolloverExpiryDurationType } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────
// Lazy reset with rollovers (DB path) — GET /customers skip_cache
//
// Attach product with rollover config → track some usage → expire
// cusEnt → GET customer (skip_cache) → verify lazy reset created
// a rollover from the unused balance and refreshed the grant.
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lazy reset rollover (DB): creates rollover from unused balance on reset")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-db",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 250 }),
		],
	});

	await timeout(2000);

	// Before reset: 400 - 250 = 150 remaining
	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(150);
	expect(before.balances[TestFeature.Messages].usage).toBe(250);

	// Expire cusEnt so the next read triggers a lazy reset
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// GET customer (DB path) should trigger lazy reset:
	// - Unused balance = 150 → rollover = min(150, cap 500) = 150
	// - Fresh grant = 400
	// - Total = 400 + 150 = 550
	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});

	expect(after.balances[TestFeature.Messages].usage).toBe(0);
	expect(after.balances[TestFeature.Messages].current_balance).toBe(550);
	expect(after.balances[TestFeature.Messages].rollovers).toBeDefined();
	expect(after.balances[TestFeature.Messages].rollovers!.length).toBe(1);
	expect(after.balances[TestFeature.Messages].rollovers![0].balance).toBe(150);

	// Verify next_reset_at advanced into the future
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

// ─────────────────────────────────────────────────────────────────
// Lazy reset with rollovers (cache path) — GET /customers (cached)
//
// Same idea but through the cache path, and with a lower rollover
// cap to verify the cap is respected.
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lazy reset rollover (cache): caps rollover at max and resets via cache")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 300,
		rolloverConfig: {
			max: 100,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-cache",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
		],
	});

	// Before reset: 300 - 50 = 250 remaining
	// Warm the cache
	const before = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(before.balances[TestFeature.Messages].current_balance).toBe(250);
	expect(before.balances[TestFeature.Messages].usage).toBe(50);

	// Expire cusEnt so the next read triggers a lazy reset
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// GET customer (cache path) should trigger lazy reset:
	// - Unused balance = 250, but rollover cap = 100 → rollover = 100
	// - Fresh grant = 300
	// - Total = 300 + 100 = 400
	const after = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(after.balances[TestFeature.Messages].usage).toBe(0);
	expect(after.balances[TestFeature.Messages].current_balance).toBe(400);
	expect(after.balances[TestFeature.Messages].rollovers).toBeDefined();
	expect(after.balances[TestFeature.Messages].rollovers!.length).toBe(1);
	expect(after.balances[TestFeature.Messages].rollovers![0].balance).toBe(100);

	// Verify next_reset_at advanced into the future
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});
