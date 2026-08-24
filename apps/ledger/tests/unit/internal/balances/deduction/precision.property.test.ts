import { describe, expect, it } from "bun:test";
import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { computeDeductionBuckets } from "../../../../../src/internal/balances/deduction/computeDeductionBuckets.js";
import { customerEntitlementsToDeductionRows } from "../../../../../src/internal/balances/deduction/customerEntitlementsToDeductionRows.js";
import { deductFromCustomerEntitlements } from "../../../../../src/internal/balances/deduction/deductFromCustomerEntitlements.js";
import type { DeductionBucket } from "../../../../../src/internal/balances/deduction/types/deductionBucket.js";
import type { DeductionOptions } from "../../../../../src/internal/balances/deduction/types/deductionOptions.js";
import {
	customerEntitlementFixture,
	featureFixture,
} from "../../../testUtils/customerEntitlementFixture.js";

const CASES = 2_000;
const TOLERANCE = 1e-10;
const DECIMALS = 10;
const SCALE = 10 ** DECIMALS;
// A 10-decimal value only stays an exact double up to 9e15 scaled, so the more
// decimals a generated value carries the smaller its integer part may be.
const EXACT_SCALED_LIMIT = 9e15;
const MAX_UNITS = 1_000_000;
const MAX_ROWS = 4;
const CREDIT_COSTS = [1, 0.5, 0.01, 3, 7.5];

const feature = featureFixture();

// One generated input: `value` is what the kernel folds in doubles, `scaled` the
// exact decimal the reference folds in integers.
type DecimalValue = { value: number; scaled: bigint };

const randomInt = (max: number): number => Math.floor(Math.random() * max);

const pick = <T>(values: T[]): T => values[randomInt(values.length)];

const randomDecimal = ({
	maxUnits = MAX_UNITS,
	maxDecimals = DECIMALS,
}: {
	maxUnits?: number;
	maxDecimals?: number;
} = {}): DecimalValue => {
	const decimals = randomInt(maxDecimals + 1);
	const units = randomInt(
		Math.min(maxUnits, Math.floor(EXACT_SCALED_LIMIT / 10 ** decimals)),
	);
	const scaled =
		BigInt(units) * BigInt(10 ** decimals) + BigInt(randomInt(10 ** decimals));

	return {
		value: Number(scaled) / 10 ** decimals,
		scaled: scaled * 10n ** BigInt(DECIMALS - decimals),
	};
};

// The clamps come off the shared helpers as doubles, at magnitudes small enough
// that the nearest 10-decimal value is recovered exactly.
const toScaled = (value: number): bigint => BigInt(Math.round(value * SCALE));

const bigMin = (left: bigint, right: bigint): bigint =>
	left < right ? left : right;
const bigMax = (left: bigint, right: bigint): bigint =>
	left > right ? left : right;

// calculateBucketChange, in exact decimal arithmetic.
const referenceBucketChange = ({
	bucket,
	balance,
	amount,
}: {
	bucket: DeductionBucket;
	balance: { balance: bigint; adjustment: bigint };
	amount: bigint;
}): bigint => {
	const limit = bucket.limit === null ? null : toScaled(bucket.limit);
	switch (bucket.kind) {
		case "spend_included":
			return bigMax(0n, bigMin(amount, balance.balance));
		case "spend_overage":
			return limit === null
				? amount
				: bigMax(0n, bigMin(amount, balance.balance - limit));
		case "refund_overage":
			return -bigMin(-amount, bigMax(0n, -balance.balance));
		case "refund_included":
			return limit === null
				? amount
				: -bigMin(
						-amount,
						bigMax(0n, limit + balance.adjustment - balance.balance),
					);
		case "unlimited":
			return amount;
	}
};

// The kernel's fold, in exact decimal arithmetic. Every row costs one credit
// until credit systems land, so no multiply or divide enters the loop.
const referenceDeduct = ({
	rows,
	amount,
	amountScaled,
	options,
}: {
	rows: GeneratedRow[];
	amount: number;
	amountScaled: bigint;
	options: DeductionOptions;
}) => {
	const balances = new Map(
		rows.map((row) => [
			row.customerEntitlement.id,
			{ balance: row.balanceScaled, adjustment: row.adjustmentScaled },
		]),
	);
	const buckets = computeDeductionBuckets({
		rows: customerEntitlementsToDeductionRows({
			customerEntitlements: rows.map((row) => row.customerEntitlement),
			request: { feature, amount },
		}),
		amount,
		options,
	});

	let remaining = amountScaled;
	for (const bucket of buckets) {
		if (remaining === 0n) break;

		const balance = balances.get(
			bucket.customerEntitlementDeduction.customer_entitlement_id,
		);
		if (!balance) continue;

		const change = referenceBucketChange({
			bucket,
			balance,
			amount: remaining,
		});
		if (change === 0n) continue;

		balance.balance -= change;
		remaining -= change;
	}

	return { balances, remaining };
};

type GeneratedRow = {
	customerEntitlement: FullCusEntWithFullCusProduct;
	balanceScaled: bigint;
	adjustmentScaled: bigint;
};

const randomRow = ({
	index,
	unlimited,
}: {
	index: number;
	unlimited: boolean;
}): GeneratedRow => {
	const sign = Math.random() < 0.2 ? -1n : 1n;
	const balance = randomDecimal();
	const adjustment = randomDecimal({ maxUnits: 100, maxDecimals: 4 });
	const allowance = randomDecimal({ maxUnits: 1_000, maxDecimals: 4 });
	const overage = randomDecimal({ maxUnits: 1_000, maxDecimals: 4 });
	const usageAllowed = Math.random() < 0.5;

	return {
		customerEntitlement: customerEntitlementFixture({
			id: `ce_${index}`,
			balance: balance.value * Number(sign),
			allowance: allowance.value,
			adjustment: adjustment.value,
			usageAllowed,
			usageLimit: usageAllowed ? allowance.value + overage.value : null,
			unlimited,
			feature,
		}),
		balanceScaled: balance.scaled * sign,
		adjustmentScaled: adjustment.scaled,
	};
};

// Credit costs are pinned at 1 until credit systems land, so the set that would
// scale them scales the tracked amount instead.
const randomAmount = (): DecimalValue => {
	const base = randomDecimal({ maxUnits: 10_000, maxDecimals: 8 });
	const creditCost = pick(CREDIT_COSTS);
	const sign = Math.random() < 0.3 ? -1n : 1n;

	return {
		value: base.value * creditCost * Number(sign),
		scaled: ((base.scaled * BigInt(creditCost * 100)) / 100n) * sign,
	};
};

const randomCase = () => {
	const rowCount = 1 + randomInt(MAX_ROWS);
	const unlimitedAt = Math.random() < 0.1 ? randomInt(rowCount) : -1;
	const isAllow = Math.random() < 0.3;
	const amount = randomAmount();

	return {
		rows: Array.from({ length: rowCount }, (_row, index) =>
			randomRow({ index, unlimited: index === unlimitedAt }),
		),
		amount,
		options: {
			overageBehaviour: isAllow ? ("allow" as const) : ("cap" as const),
			isAllow,
			isConsumption: amount.value > 0,
		} satisfies DeductionOptions,
	};
};

// float64 cannot hold a ten-decimal value near 1e6 to 1e-10 — one ulp there is
// already 1.16e-10 — so the budget floors at a few ulps of the largest input.
const ALLOWED_ULPS = 8;

const toleranceFor = (magnitude: number): number =>
	Math.max(TOLERANCE, ALLOWED_ULPS * magnitude * Number.EPSILON);

const driftOf = ({
	actual,
	expected,
}: {
	actual: number;
	expected: bigint;
}): number => Math.abs(actual - Number(expected) / SCALE);

const caseMagnitude = ({
	rows,
	amount,
}: {
	rows: GeneratedRow[];
	amount: number;
}): number =>
	Math.max(
		Math.abs(amount),
		...rows.map((row) => Math.abs(row.customerEntitlement.balance ?? 0)),
	);

describe("deduction precision", () => {
	it("matches exact decimal arithmetic over 2,000 random folds", () => {
		let maxRemainingDrift = 0;
		let maxBalanceDrift = 0;
		let maxDriftOfBudget = 0;

		for (let index = 0; index < CASES; index++) {
			const { rows, amount, options } = randomCase();
			const budget = toleranceFor(
				caseMagnitude({ rows, amount: amount.value }),
			);

			const folded = deductFromCustomerEntitlements({
				customerEntitlements: rows.map((row) => row.customerEntitlement),
				requests: [{ feature, amount: amount.value }],
				options,
			});
			const expected = referenceDeduct({
				rows,
				amount: amount.value,
				amountScaled: amount.scaled,
				options,
			});

			const remainingDrift = driftOf({
				actual: folded.remainingByFeatureId[feature.id],
				expected: expected.remaining,
			});
			maxRemainingDrift = Math.max(maxRemainingDrift, remainingDrift);
			maxDriftOfBudget = Math.max(maxDriftOfBudget, remainingDrift / budget);

			for (const [id, settled] of expected.balances) {
				const after = folded.balancesAfter[id];
				if (!after) throw new Error(`kernel dropped balance ${id}`);

				const balanceDrift = driftOf({
					actual: after.balance,
					expected: settled.balance,
				});
				maxBalanceDrift = Math.max(maxBalanceDrift, balanceDrift);
				maxDriftOfBudget = Math.max(maxDriftOfBudget, balanceDrift / budget);
			}
		}

		process.stdout.write(
			`\n  max drift — remaining ${maxRemainingDrift.toExponential(3)}, balance ${maxBalanceDrift.toExponential(3)} (${(maxDriftOfBudget * 100).toFixed(1)}% of the ${ALLOWED_ULPS}-ulp budget)\n`,
		);
		expect(maxDriftOfBudget).toBeLessThanOrEqual(1);
	});
});
