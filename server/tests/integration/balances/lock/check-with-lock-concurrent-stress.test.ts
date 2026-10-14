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

const NUM_PAIRS = 500;

const INITIAL_ACTION1 = 1000;
const INITIAL_CREDITS = 2000;
const CREDIT_COST = 0.2;

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

		await Promise.all(pairs.map(({ lockKey }) => deleteLock({ ctx, lockId: lockKey })));

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

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

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
