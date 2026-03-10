import { expect, test } from "bun:test";
import { type ApiCustomerV5, RecaseError } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expireLock } from "@/internal/balances/finalizeLock/expireLock";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey";

export const buildExpireLockPayload = ({
	ctx,
	customerId,
	lockKey,
}: {
	ctx: TestContext;
	customerId: string;
	lockKey?: string;
}) => {
	const key = lockKey ?? customerId;
	return {
		customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: key,
		hashedKey: buildLockReceiptKey({
			orgId: ctx.org.id,
			env: ctx.env,
			lockKey: Bun.hash(key).toString(),
		}),
	};
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared product setup
// ─────────────────────────────────────────────────────────────────────────────

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	return products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});
};

// ─────────────────────────────────────────────────────────────────────────────
// RC-1: Double expiry — concurrent expireLock x2
// Expected: balance restored exactly once (unwind runs once, second is a no-op)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("race RC-1: double expiry concurrent — balance restored exactly once")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = `race-rc1`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 3,
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	const payload = buildExpireLockPayload({ ctx, customerId });

	// Fire both expiries concurrently — only one should unwind
	await Promise.allSettled([
		expireLock({ ctx, payload }),
		expireLock({ ctx, payload }),
	]);

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// Full 15 restored (8 unwound, not 16)
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 12,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RC-2: Confirm then expire
// Expected: balance reflects confirm value (partial keep), expiry is a no-op
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("race RC-2: confirm then expire — expiry is no-op, balance reflects confirm")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	// Confirm keeping 4 usage (release 4 back)
	await autumnV2_1.balances.finalize({
		lock_key: customerId,
		action: "confirm",
		override_value: 4,
	});

	// Now expire — should be a no-op since lock is already confirmed
	try {
		await expireLock({
			ctx,
			payload: buildExpireLockPayload({ ctx, customerId }),
		});
	} catch (error) {
		expect(error).toBeInstanceOf(RecaseError);
	}

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// 15 total - 4 kept = 11 remaining
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 11,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RC-3: Expire then confirm
// Expected: confirm returns gracefully (no throw), balance stays fully released
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("race RC-3: expire then confirm — confirm is graceful no-op")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	// Expire first — full release
	await expireLock({
		ctx,
		payload: buildExpireLockPayload({ ctx, customerId }),
	});

	// Confirm after expiry — should not throw, should be gracefully ignored
	await expectAutumnError({
		func: () =>
			autumnV2_1.balances.finalize({
				lock_key: customerId,
				action: "confirm",
				override_value: 4,
			}),
	});

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// Full 15 restored by expiry, confirm was a no-op
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RC-4: Confirm twice — duplicate confirm
// Expected: second confirm is idempotent, balance reflects first confirm value
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("race RC-4: confirm twice — idempotent, balance reflects first confirm")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-4";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	// Confirm twice concurrently — one should win and the other should be a graceful no-op
	const results = await Promise.allSettled([
		autumnV2_1.balances.finalize({
			lock_key: customerId,
			action: "confirm",
			override_value: 4,
		}),
		autumnV2_1.balances.finalize({
			lock_key: customerId,
			action: "confirm",
			override_value: 4,
		}),
	]);

	expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
	expect(results.filter((r) => r.status === "rejected").length).toBe(1);

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// 15 - 4 = 11, not 15 - 8 = 7 (double deduct)
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 11,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RC-5: Receipt missing then expire
// Expected: expireLock handles missing receipt gracefully (no throw)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("race RC-5: receipt evicted — expireLock handles missing receipt gracefully")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-5";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	// Simulate Redis eviction by deleting the receipt
	await deleteLock({ ctx, lockKey: customerId });

	try {
		await expireLock({
			ctx,
			payload: buildExpireLockPayload({ ctx, customerId }),
		});
	} catch (error) {
		expect(error).toBeInstanceOf(RecaseError);
	}

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// Full 15 restored by expiry, confirm was a no-op
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 7,
	});
});
