import { test } from "bun:test";
import { type ApiCustomerV5, ErrCode } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// ERR-1: lock on allocated feature → 400
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-with-lock-errors ERR-1: lock not supported for allocated feature")}`, async () => {
	const allocatedUsers = items.allocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({
		id: "free",
		items: [allocatedUsers],
	});

	const customerId = "lock-error-allocated-1";

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				required_balance: 1,
				lock: { enabled: true, key: customerId },
			});
		},
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ERR-2: duplicate lock key (Redis path) → 409
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-with-lock-errors ERR-2: duplicate lock key (Redis) → 409")}`, async () => {
	const freeProd = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 20 })],
	});

	const customerId = "lock-error-duplicate-redis-1";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	// First check — should succeed and create the lock receipt
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, key: customerId },
	});

	// Second check with same lock key — should fail with LockAlreadyExists
	await expectAutumnError({
		errCode: ErrCode.LockAlreadyExists,
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 5,
				lock: { enabled: true, key: customerId },
			});
		},
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ERR-3: duplicate lock key (Postgres / skip_cache path) → 409
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-with-lock-errors ERR-3: duplicate lock key (Postgres) → 409")}`, async () => {
	const freeProd = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 20 })],
	});

	const customerId = "lock-error-duplicate-postgres-1";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	// First check via Postgres — should succeed
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, key: customerId },
		skip_cache: true,
	});

	// Second check with same lock key — should fail with LockAlreadyExists
	await expectAutumnError({
		errCode: ErrCode.LockAlreadyExists,
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 5,
				lock: { enabled: true, key: customerId },
				skip_cache: true,
			});
		},
	});

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	const customerAfterNoncached = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);

	expectBalanceCorrect({
		customer: customerAfterNoncached,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
});
