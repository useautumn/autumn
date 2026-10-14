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
	lockId,
}: {
	ctx: TestContext;
	customerId: string;
	lockId?: string;
}) => {
	const key = lockId ?? customerId;
	return {
		customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		lockId: key,
		hashedKey: buildLockReceiptKey({
			orgId: ctx.org.id,
			env: ctx.env,
			lockKey: Bun.hash(key).toString(),
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

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	const payload = buildExpireLockPayload({ ctx, customerId });

	await Promise.allSettled([
		expireLock({ ctx, payload }),
		expireLock({ ctx, payload }),
	]);

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 12,
	});
});

test.concurrent(`${chalk.yellowBright("race RC-2: confirm then expire — expiry is no-op, balance reflects confirm")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 4,
	});

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

	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 11,
	});
});

test.concurrent(`${chalk.yellowBright("race RC-3: expire then confirm — confirm is graceful no-op")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await expireLock({
		ctx,
		payload: buildExpireLockPayload({ ctx, customerId }),
	});

	await expectAutumnError({
		func: () =>
			autumnV2_1.balances.finalize({
				lock_id: customerId,
				action: "confirm",
				override_value: 4,
			}),
	});

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
});

test.concurrent(`${chalk.yellowBright("race RC-4: confirm twice — idempotent, balance reflects first confirm")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-4";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	const results = await Promise.allSettled([
		autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 4,
		}),
		autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 4,
		}),
	]);

	expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
	expect(results.filter((r) => r.status === "rejected").length).toBe(1);

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 11,
	});
});

test.concurrent(`${chalk.yellowBright("race RC-5: receipt evicted — expireLock handles missing receipt gracefully")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-race-5";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await deleteLock({ ctx, lockId: customerId });

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

	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 7,
	});
});
