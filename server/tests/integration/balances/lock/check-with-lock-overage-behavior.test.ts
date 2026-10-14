import { expect, test } from "bun:test";
import type { ApiCustomerV5, CheckResponseV3 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { setCustomerSpendLimit } from "@tests/integration/balances/utils/spend-limit-utils/customerSpendLimitUtils.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeFreeProd = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 20 })],
	});

const makeUsageProd = () =>
	products.base({
		id: "usage",
		items: [items.consumableMessages({ includedUsage: 20, price: 1 })],
	});

const initLockCustomer = async ({ customerId }: { customerId: string }) => {
	const prod = makeFreeProd();
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});
	await deleteLock({ ctx: scenario.ctx, lockId: customerId });
	return scenario;
};

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-1: omitted defaults to reject — allowed false, nothing deducted")}`,
	async () => {
		const customerId = "lock-overage-default-reject";
		const { autumnV2_1 } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: { enabled: true, lock_id: customerId },
		});
		expect(res.allowed).toBe(false);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-2: explicit reject — allowed false, nothing deducted")}`,
	async () => {
		const customerId = "lock-overage-explicit-reject";
		const { autumnV2_1 } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: { enabled: true, lock_id: customerId, overage_behavior: "reject" },
		});
		expect(res.allowed).toBe(false);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-3: cap — partial reservation, allowed true, confirm keeps 20")}`,
	async () => {
		const customerId = "lock-overage-cap-confirm";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: { enabled: true, lock_id: customerId, overage_behavior: "cap" },
		});
		expect(res.allowed).toBe(true);

		const afterLock = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterLock,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 20,
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
		});

		const afterConfirm =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterConfirm,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 20,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 100 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-4: cap — finalize override above balance clamps at 0")}`,
	async () => {
		const customerId = "lock-overage-cap-override";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
			lock: { enabled: true, lock_id: customerId, overage_behavior: "cap" },
		});
		expect(res.allowed).toBe(true);

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 50,
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 20,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 45 }, { value: 5 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-5: overflow — full reservation goes negative, allowed true")}`,
	async () => {
		const customerId = "lock-overage-overflow-confirm";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: {
				enabled: true,
				lock_id: customerId,
				overage_behavior: "overflow",
			},
		});
		expect(res.allowed).toBe(true);

		const afterLock = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterLock,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 100,
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
		});

		const afterConfirm =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterConfirm,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 100,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 100 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-6: overflow — finalize override above lock keeps overflowing")}`,
	async () => {
		const customerId = "lock-overage-overflow-override";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 30,
			lock: {
				enabled: true,
				lock_id: customerId,
				overage_behavior: "overflow",
			},
		});
		expect(res.allowed).toBe(true);

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 80,
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 80,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 50 }, { value: 30 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-7: overflow — release refunds the full negative lock")}`,
	async () => {
		const customerId = "lock-overage-overflow-release";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: {
				enabled: true,
				lock_id: customerId,
				overage_behavior: "overflow",
			},
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "release",
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 20,
			usage: 0,
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-8: overflow — confirm below lock unwinds the difference")}`,
	async () => {
		const customerId = "lock-overage-overflow-unwind";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: {
				enabled: true,
				lock_id: customerId,
				overage_behavior: "overflow",
			},
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 50,
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 50,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: -50 }, { value: 100 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-9: overflow — spend limit still clamps the reservation")}`,
	async () => {
		const customerId = "lock-overage-overflow-spend-limit";
		const usageProd = makeUsageProd();
		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [usageProd] }),
			],
			actions: [s.billing.attach({ productId: usageProd.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 30,
		});

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
			lock: {
				enabled: true,
				lock_id: customerId,
				overage_behavior: "overflow",
			},
		});
		expect(res.allowed).toBe(true);

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 50,
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-overage OB-10: overflow — Postgres path persists the mode on the receipt")}`,
	async () => {
		const customerId = "lock-overage-overflow-postgres";
		const { autumnV2_1, ctx } = await initLockCustomer({ customerId });

		const res = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 30,
			lock: {
				enabled: true,
				lock_id: customerId,
				overage_behavior: "overflow",
			},
			skip_cache: true,
		});
		expect(res.allowed).toBe(true);

		await autumnV2_1.balances.finalize(
			{ lock_id: customerId, action: "confirm", override_value: 80 },
			{ skipCache: true },
		);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 80,
		});

		const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerDb,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 80,
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);
