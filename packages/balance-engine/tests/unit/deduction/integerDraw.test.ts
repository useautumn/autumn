/**
 * A flat integer draw settles in plain numbers. It must decide exactly what the Decimal draw decides:
 * every outcome over random rows, rollovers, bounds and values is compared field for field.
 */

import { describe, expect, test } from "bun:test";
import { Decimal } from "decimal.js";
import {
	createSubjectState,
	incrementRow,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import {
	deductFromBuckets,
	deductionStateToOutcome,
	deductWithContext,
} from "../../../src/deduction/deduct.js";
import { setupDeductionContext } from "../../../src/deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../../src/deduction/types/deductionContext.js";
import type { DeductionRequest } from "../../../src/deduction/types/deductionRequest.js";
import type { DeductionState } from "../../../src/deduction/types/deductionState.js";
import { isIntegerDraw } from "../../../src/deduction/utils/draw/integerDraw.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import { createDeductionRequest } from "./deductionFixtures.js";

const seededRandom = (seed: number) => {
	let value = seed;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** The draw as it stood before the fast path: Decimal all the way. */
const decimalDraw = ({
	context,
	request,
}: {
	context: DeductionContext;
	request: DeductionRequest;
}) => {
	const deductionState: DeductionState = {
		remaining: new Decimal(request.value),
		terms: request.terms,
		deltas: [],
		usageWindowConsumed: new Map(),
	};
	deductFromBuckets({ context, deductionState });
	return deductionStateToOutcome({ context, deductionState, request });
};

const randomDraw = ({ random }: { random: () => number }) => {
	const integer = (min: number, max: number) =>
		min + Math.floor(random() * (max - min + 1));
	const pick = <T>(options: T[]): T =>
		options[integer(0, options.length - 1)] as T;
	// Mostly integers; now and then a fraction, which must fall back and still agree.
	const amount = (min: number, max: number) =>
		random() < 0.1 ? integer(min, max) + 0.25 : integer(min, max);

	const rowCount = integer(1, 4);
	const customerEntitlements = Array.from({ length: rowCount }, (_, index) => ({
		...createCustomerEntitlement({
			id: `row_${index}`,
			balance: amount(-15, 30),
		}),
		usage_allowed: random() < 0.4,
		unlimited: index === 0 && random() < 0.1,
	}));
	const rollovers = Array.from({ length: integer(0, 2) }, (_, index) => ({
		id: `ro_${index}`,
		cus_ent_id: pick(customerEntitlements).id,
		balance: amount(0, 12),
		usage: integer(0, 5),
		expires_at: occurredAt + 1_000 * (index + 1),
		entities: {},
	}));
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		rollovers,
	});
	const request = createDeductionRequest({
		org,
		value: random() < 0.05 ? 0 : amount(-25, 60),
		overageBehavior: pick(["cap", "reject", "overflow"] as const),
		enforcesSpendLimit: random() < 0.5,
	});
	const context = setupDeductionContext({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: createCatalogFor({ state }),
		}),
		selection: request.selection,
	});
	return { context, request };
};

describe("integer draw", () => {
	for (const seed of [1, 2, 3, 4, 5])
		test(`decides every draw exactly as the Decimal draw (seed ${seed})`, () => {
			const random = seededRandom(seed);
			let integerDraws = 0;
			for (let n = 0; n < 2_000; n++) {
				const { context, request } = randomDraw({ random });
				if (isIntegerDraw({ context, request })) integerDraws++;
				expect(deductWithContext({ context, request })).toEqual(
					decimalDraw({ context, request }),
				);
			}
			expect(integerDraws).toBeGreaterThan(1_000);
		});

	test("fractions, rate cards and values past 2^50 take the Decimal draw", () => {
		const { context, request } = randomDraw({ random: seededRandom(9) });
		const flat = context.rows.map((row) => ({
			...row,
			balance: 5,
			creditCost: 1,
			rateCard: null,
		}));
		const flatContext = { ...context, rows: flat, rolloverRows: [] };
		expect(
			isIntegerDraw({
				context: flatContext,
				request: { ...request, value: 3 },
			}),
		).toBe(true);
		expect(
			isIntegerDraw({
				context: flatContext,
				request: { ...request, value: 2.5 },
			}),
		).toBe(false);
		expect(
			isIntegerDraw({
				context: flatContext,
				request: { ...request, value: 2 ** 51 },
			}),
		).toBe(false);
		expect(
			isIntegerDraw({
				context: {
					...flatContext,
					rows: flat.map((row) => ({ ...row, creditCost: 2 })),
				},
				request: { ...request, value: 3 },
			}),
		).toBe(false);
	});

	test("an increment adds integers as Decimal would, signed zeros included", () => {
		const random = seededRandom(11);
		const samples = [0, -0, 1, -1, 7, -7, 2 ** 50, -(2 ** 50), 0.1, -2.5];
		for (let n = 0; n < 2_000; n++) {
			const balance =
				random() < 0.3
					? (samples[Math.floor(random() * samples.length)] ?? 0)
					: Math.floor(random() * 200) - 100;
			const delta =
				random() < 0.3
					? (samples[Math.floor(random() * samples.length)] ?? 0)
					: Math.floor(random() * 200) - 100;
			const next = incrementRow({
				row: { id: "row", balance },
				change: {
					table: "customerEntitlements",
					op: "increment",
					id: "row",
					add: { balance: delta },
				},
			});
			expect(
				Object.is(next.balance, new Decimal(balance).plus(delta).toNumber()),
			).toBe(true);
		}
	});
});
