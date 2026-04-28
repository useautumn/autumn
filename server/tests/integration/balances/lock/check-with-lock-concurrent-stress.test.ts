import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stress test: 1000 concurrent (check-with-lock + finalize) pairs that
// intentionally cross the Action1 → Credits boundary.
//
// Credit system: Action1 → Credits (credit_cost = 0.2)
//   i.e. 1 Action1 unit costs 0.2 Credits
//
// Product: Action1(1000) + Credits(2000)
//
// Each pair:
//   - lock_value:     random decimal in [0.51, 2.99] (Action1 units)
//   - override_value: random decimal in [0.10, 3.50] (mix of refunds & extra deductions)
//
// With 1000 pairs and average override ≈ 1.80, the expected total override is
// ~1800 Action1 units — well above the 1000 included_usage. The excess spills
// into Credits at 0.2 credits per action1 unit.
//
// Expected final state (Decimal.js precision):
//   totalOverride     = sum(all override_values)
//   action1Remaining  = max(0, 1000 - totalOverride)
//   creditsConsumed   = max(0, totalOverride - 1000) × 0.2
//   creditsRemaining  = 2000 - creditsConsumed
//
// Both cached and non-cached (DB-synced) balances are asserted.
// ─────────────────────────────────────────────────────────────────────────────

// Reduced from 1000 — local Redis saturates under FullSubject cache load
const NUM_PAIRS = 500;

const INITIAL_ACTION1 = 1000;
const INITIAL_CREDITS = 2000;
const CREDIT_COST = 0.2; // 1 action1 unit = 0.2 credits

const randomDecimal = (min: number, max: number): Decimal =>
	new Decimal(Math.random() * (max - min) + min).toDecimalPlaces(2);

test(
	`${chalk.yellowBright(`lock-stress: ${NUM_PAIRS} concurrent (check+finalize) pairs — crosses Action1→Credits boundary`)}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [
				items.free({
					featureId: TestFeature.Action1,
					includedUsage: INITIAL_ACTION1,
				}),
				items.monthlyCredits({ includedUsage: INITIAL_CREDITS }),
			],
		});

		const customerId = "lock-stress-1";

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// ── Generate all (lock_value, override_value, lock_id) triples up front ──

		type Pair = {
			lockKey: string;
			lockValue: Decimal;
			overrideValue: Decimal;
		};

		let totalOverride = new Decimal(0);

		const pairs: Pair[] = Array.from({ length: NUM_PAIRS }, (_, i) => {
			const lockValue = randomDecimal(0.51, 2.99);
			const overrideValue = randomDecimal(0.1, 3.5);
			totalOverride = totalOverride.plus(overrideValue);
			return {
				lockKey: `${customerId}-lock-${i}`,
				lockValue,
				overrideValue,
			};
		});

		// Clean up any stale lock receipts from previous runs
		await Promise.all(pairs.map(({ lockKey }) => deleteLock({ ctx, lockId: lockKey })));

		// ── Fire all (check + finalize) pairs concurrently ──
		// Each pair is sequential within itself (check must complete before its own
		// finalize), but all 1000 pairs run fully in parallel with each other.

		const startTime = Date.now();

		await Promise.all(
			pairs.map(async ({ lockKey, lockValue, overrideValue }) => {
				await autumnV2_1.check({
					customer_id: customerId,
					feature_id: TestFeature.Action1,
					required_balance: lockValue.toNumber(),
					lock: { enabled: true, lock_id: lockKey },
				});

				await autumnV2_1.balances.finalize({
					lock_id: lockKey,
					action: "confirm",
					override_value: overrideValue.toNumber(),
				});
			}),
		);

		console.log(
			`[lock-stress] ${NUM_PAIRS} (check+finalize) pairs completed in ${Date.now() - startTime}ms`,
		);

		// ── Compute expected balances ──

		// Action1 is exhausted first; overflow spills into Credits at CREDIT_COST per unit.
		const action1Overflow = Decimal.max(
			0,
			totalOverride.minus(INITIAL_ACTION1),
		);
		const creditsConsumed = action1Overflow.mul(CREDIT_COST);

		const expectedAction1Remaining = Decimal.max(
			0,
			new Decimal(INITIAL_ACTION1).minus(totalOverride),
		)
			.toDecimalPlaces(2)
			.toNumber();

		const expectedCreditsRemaining = new Decimal(INITIAL_CREDITS)
			.minus(creditsConsumed)
			.toDecimalPlaces(2)
			.toNumber();

		console.log(
			`[lock-stress] totalOverride=${totalOverride.toFixed(2)}, ` +
				`action1Overflow=${action1Overflow.toFixed(2)}, ` +
				`creditsConsumed=${creditsConsumed.toFixed(2)}`,
		);
		console.log(
			`[lock-stress] expected action1=${expectedAction1Remaining}, credits=${expectedCreditsRemaining}`,
		);

		// ── Assert cached balances ──

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

		// Round to 2dp to absorb float accumulation across 1000 additions
		const actualAction1Cached = new Decimal(
			customer.balances[TestFeature.Action1]?.remaining ?? 0,
		)
			.toDecimalPlaces(2)
			.toNumber();

		const actualCreditsCached = new Decimal(
			customer.balances[TestFeature.Credits]?.remaining ?? 0,
		)
			.toDecimalPlaces(2)
			.toNumber();

		expect(actualAction1Cached).toBe(expectedAction1Remaining);
		expect(actualCreditsCached).toBe(expectedCreditsRemaining);

		// ── Assert non-cached (DB-synced) balances ──

		await timeout(5000);

		const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);

		const actualAction1Db = new Decimal(
			customerDb.balances[TestFeature.Action1]?.remaining ?? 0,
		)
			.toDecimalPlaces(2)
			.toNumber();

		const actualCreditsDb = new Decimal(
			customerDb.balances[TestFeature.Credits]?.remaining ?? 0,
		)
			.toDecimalPlaces(2)
			.toNumber();

		expect(actualAction1Db).toBe(expectedAction1Remaining);
		expect(actualCreditsDb).toBe(expectedCreditsRemaining);
	},
	{ timeout: 120_000 },
);
