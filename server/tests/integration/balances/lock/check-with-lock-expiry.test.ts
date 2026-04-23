import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addSeconds } from "date-fns";
import { redis } from "@/external/redis/initRedis";
import { expireLock } from "@/internal/balances/finalizeLock/expireLock";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt";
import { timeout } from "@/utils/genUtils";
import { getCustomerEvents } from "../utils/events/getCustomerEvents";

export const buildExpireLockPayload = ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	return {
		customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		lockId: customerId,
		hashedKey: buildLockReceiptKey({
			orgId: ctx.org.id,
			env: ctx.env,
			lockKey: customerId,
		}),
	};
};

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	return products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});
};

test.concurrent(`${chalk.yellowBright("check-with-lock-expiry 1: /check with lock, expires at works (SQS)")}`, async () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	const freeProd = products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});

	const customerId = `check-lock-expiry-1`;
	const { autumnV2_1, ctx } = await initScenario({
		customerId: customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({
		ctx,
		lockId: customerId,
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: {
			enabled: true,
			lock_id: customerId,
			expires_at: addSeconds(new Date(), 5).getTime(),
		},
	});

	await timeout(60000);

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
});

test.concurrent(`${chalk.yellowBright("check-with-lock-expiry 2: expires at undoes usage")}`, async () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	const freeProd = products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});

	const customerId = `check-lock-expiry-2`;
	const { autumnV2_1, ctx } = await initScenario({
		customerId: customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({
		ctx,
		lockId: customerId,
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: {
			enabled: true,
			lock_id: customerId,
		},
	});

	// Run expire lock function
	await expireLock({
		ctx,
		payload: buildExpireLockPayload({ ctx, customerId }),
	});

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	await timeout(3000);

	// Grab events
	const events = await getCustomerEvents({
		customerId,
	});

	expect(events).toHaveLength(2);
	expect(events[0].value).toBe(-8);
	expect(events[1].value).toBe(8);
});

// ─────────────────────────────────────────────────────────────────────────────
// check-lock-expiry-3: expires_at > 1 day from now → HTTP 400
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-lock-expiry-3: expires_at > 1 day from now is rejected")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "check-lock-expiry-3";

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const twoDaysFromNow = Date.now() + 2 * 24 * 60 * 60 * 1000;

	await expectAutumnError({
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 5,
				lock: {
					enabled: true,
					lock_id: customerId,
					expires_at: twoDaysFromNow,
				},
			});
		},
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// check-lock-expiry-4: no expires_at → TTL is ~1 day from now
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-lock-expiry-4: no expires_at sets TTL ~1 day from now")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "check-lock-expiry-4";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	const beforeCheck = Math.floor(Date.now() / 1000);

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: customerId },
	});

	const { lockReceiptKey, source } = await fetchLockReceipt({ ctx, lockId: customerId });
	const redisInstance = source === "redis_v2" ? ctx.redisV2 : redis;

	const expireAt = await redisInstance.expiretime(lockReceiptKey);
	const expectedTtl = beforeCheck + 24 * 60 * 60;

	// TTL should be within 5s of now + 1 day
	expect(expireAt).toBeGreaterThanOrEqual(expectedTtl - 5);
	expect(expireAt).toBeLessThanOrEqual(expectedTtl + 5);
});

// ─────────────────────────────────────────────────────────────────────────────
// check-lock-expiry-5: expires_at set → TTL is expires_at + 1 hour
// Uses a unique ID per run to avoid duplicate EventBridge schedule errors
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-lock-expiry-5: expires_at set, TTL is expires_at + 1 hour")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = `check-lock-expiry-5-${Date.now()}`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	const expiresAt = Date.now() + 2 * 60 * 60 * 1000;

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: customerId, expires_at: expiresAt },
	});

	const { lockReceiptKey, source } = await fetchLockReceipt({ ctx, lockId: customerId });
	const redisInstance = source === "redis_v2" ? ctx.redisV2 : redis;

	const expireAt = await redisInstance.expiretime(lockReceiptKey);
	const expectedTtl = Math.ceil(expiresAt / 1000) + 60 * 60;

	// TTL should be within 5s of expires_at + 1 hour
	expect(expireAt).toBeGreaterThanOrEqual(expectedTtl - 5);
	expect(expireAt).toBeLessThanOrEqual(expectedTtl + 5);
});
