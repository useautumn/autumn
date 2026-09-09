/**
 * TDD test for `overage_behavior` on `check.lock`.
 *
 * Contract under test:
 *   New types/fields:
 *     - check.lock.overage_behavior?: "reject" | "cap" | "overflow" (default "reject")
 *     - lock receipt persists `overage_behavior`
 *   New behaviors:
 *     - omitted / "reject": short balance -> allowed: false, nothing deducted (unchanged)
 *     - "cap": short balance -> deducts what fits, allowed: true
 *     - "overflow": short balance -> deducts full value, balance negative, allowed: true
 *     - finalize confirm with override_value above the lock re-uses the receipt's mode
 *       for the additional deduction (cap clamps at 0, overflow goes negative)
 *     - finalize release under overflow refunds the full negative lock
 *     - "overflow" still honours the customer spend limit
 *   Side effects:
 *     - events carry the requested value (same as track), balances carry the clamped one
 *
 * Pre-impl red: `overage_behavior` is rejected by LockParamsSchema / ignored, so
 * cap + overflow cases return allowed: false with no deduction.
 * Post-impl green: lock mode flows check -> receipt -> finalize.
 */

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

// Usage-based overage: spend limits only apply to paid usage.
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

// ─────────────────────────────────────────────────────────────────────────────
// OB-1: omitted → reject (unchanged default). balance 20, lock 100 → allowed: false
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-2: explicit reject behaves like OB-1
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-3: cap. balance 20, lock 100 → allowed: true, remaining 0.
// confirm (no override) → lockValue is 20 (what was actually deducted), nothing more happens.
// ─────────────────────────────────────────────────────────────────────────────

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

		// Event value is the requested amount, as with track under cap.
		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 100 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// OB-4: cap + finalize override above lock. balance 20, lock 5, confirm 50.
// additional 45 runs under cap → clamps at 0 → remaining 0, usage 20.
// ─────────────────────────────────────────────────────────────────────────────

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

		// lock 5, then additional 45 requested (only 15 fit; event keeps the request)
		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 45 }, { value: 5 }],
		});
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// OB-5: overflow. balance 20, lock 100 → allowed: true, balance -80 (usage 100).
// confirm (no override) → unchanged.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-6: overflow + finalize override above lock. balance 20, lock 30, confirm 80.
// additional 50 must also overflow (mode read from receipt, not from finalize).
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-7: overflow + release. balance 20, lock 100 → -80. release → back to 20.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-8: overflow + confirm with smaller override. lock 100 (→ -80), confirm 50.
// Unwind 50 → usage 50, remaining 0.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-9: overflow still honours the spend limit.
// usage-based: 20 included @ $1/unit, spend limit $30 → max 50 units.
// lock 100 → clamped to 50 (allowed true, partial), then confirm.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// OB-10: Postgres path (skip_cache). The receipt is written by saveLockReceiptV2
// instead of Lua, so the mode must survive that writer too.
// balance 20, lock 30 overflow → -10, confirm 80 → additional 50 → usage 80.
// ─────────────────────────────────────────────────────────────────────────────

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
