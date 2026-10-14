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
				lock: { enabled: true, lock_id: customerId },
			});
		},
	});
});

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

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: customerId },
	});

	await expectAutumnError({
		errCode: ErrCode.LockAlreadyExists,
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 5,
				lock: { enabled: true, lock_id: customerId },
			});
		},
	});
});

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

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: customerId },
		skip_cache: true,
	});

	await expectAutumnError({
		errCode: ErrCode.LockAlreadyExists,
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 5,
				lock: { enabled: true, lock_id: customerId },
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
