/**
 * The lean track paths (ENGINE_DIET) must give byte-for-byte what the baseline gives: row changes, the
 * integer draw's outcome and the usage-event fields are compared as JSON over random draws (integers,
 * fractions, entities, attribution, rollovers, rejections) and over the engine's own fixtures.
 */
import { describe, expect, test } from "bun:test";
import { Decimal } from "decimal.js";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { computeTrackDecision } from "../../../src/commands/track/computeTrack.js";
import { trackCommandToDeductionRequest } from "../../../src/commands/track/trackCommandToDeductionRequest.js";
import { deltasToUsageEventFields } from "../../../src/common/usageEvent/deltasToUsageEventFields.js";
import { advanceDeductionContext } from "../../../src/deduction/advanceDeductionContext.js";
import { advanceDeductionContextLean } from "../../../src/deduction/advanceDeductionContextLean.js";
import { deductWithContext } from "../../../src/deduction/deduct.js";
import { integerDrawToOutcome } from "../../../src/deduction/integerDrawToOutcome.js";
import { setupDeductionContext } from "../../../src/deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../../src/deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../../src/deduction/types/deductionDelta.js";
import type { DeductionRequest } from "../../../src/deduction/types/deductionRequest.js";
import { deltasToRowChanges } from "../../../src/deduction/utils/convertDeductionUtils.js";
import { deltasToRowChangesLean } from "../../../src/deduction/utils/deltasToRowChangesLean.js";
import {
	drawIntegersFromBuckets,
	isIntegerDraw,
} from "../../../src/deduction/utils/draw/integerDraw.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
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

const json = (value: unknown): string => JSON.stringify(value);

const randomDraw = ({ random }: { random: () => number }) => {
	const integer = (min: number, max: number) =>
		min + Math.floor(random() * (max - min + 1));
	const pick = <T>(options: T[]): T =>
		options[integer(0, options.length - 1)] as T;
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
	const fullSubject = subjectStateToFullSubject({
		state,
		catalog: createCatalogFor({ state }),
	});
	const context = setupDeductionContext({
		fullSubject,
		selection: request.selection,
	});
	return { context, request, fullSubject };
};

/** Hand-made deltas the draw itself never emits together: entity balances, attribution, zero sums, foreign rows. */
const randomDeltas = ({
	context,
	random,
}: {
	context: DeductionContext;
	random: () => number;
}): DeductionDelta[] => {
	const integer = (min: number, max: number) =>
		min + Math.floor(random() * (max - min + 1));
	const pick = <T>(options: T[]): T =>
		options[integer(0, options.length - 1)] as T;
	const ids = [
		...context.customerEntitlements.map((row) => row.id),
		...context.rollovers.map((row) => row.id),
		"foreign_1",
		"foreign_2",
	];
	return Array.from({ length: integer(0, 6) }, () => {
		const table = pick(["customerEntitlements", "rollovers"] as const);
		const balanceDelta = random() < 0.15 ? 0 : integer(-9, 9);
		const delta: DeductionDelta = {
			table,
			id: pick(ids),
			entityKey: random() < 0.3 ? pick(["e1", "e2"]) : null,
			balanceDelta: random() < 0.1 ? balanceDelta + 0.5 : balanceDelta,
			usageDelta: table === "rollovers" ? integer(-3, 3) : 0,
			valueDelta: balanceDelta,
			creditCost: 1,
		};
		if (random() < 0.25)
			delta.usageAttributionDelta = {
				customerEntitlementId: pick(ids),
				key: pick(["feat_a", "feat_b"]),
				units: integer(-4, 4),
				credits: integer(-4, 4),
			};
		return delta;
	});
};

describe("engine diet equivalence", () => {
	for (const seed of [11, 12, 13])
		test(`row changes: lean equals baseline over random deltas (seed ${seed})`, () => {
			const random = seededRandom(seed);
			let nonEmpty = 0;
			for (let n = 0; n < 1_500; n++) {
				const { context } = randomDraw({ random });
				const deltas = randomDeltas({ context, random });
				const baseline = deltasToRowChanges({ context, deltas });
				expect(json(deltasToRowChangesLean({ context, deltas }))).toBe(
					json(baseline),
				);
				if (baseline.length > 0) nonEmpty++;
			}
			expect(nonEmpty).toBeGreaterThan(300);
		});

	for (const seed of [21, 22, 23])
		test(`integer outcome and usage-event fields: lean equals baseline over random draws (seed ${seed})`, () => {
			const random = seededRandom(seed);
			let integerDraws = 0;
			for (let n = 0; n < 1_500; n++) {
				const { context, request, fullSubject } = randomDraw({ random });
				const baseline = deductWithContext({ context, request });
				if (isIntegerDraw({ context, request })) {
					integerDraws++;
					const { remaining, deltas } = drawIntegersFromBuckets({
						context,
						request,
					});
					const lean = integerDrawToOutcome({
						context,
						remaining,
						deltas,
						request,
					});
					expect(json(lean)).toBe(json(baseline));
					expect(Object.keys(lean)).toEqual(Object.keys(baseline));
					expect(lean.usageWindowConsumed.size).toBe(0);
					expect(lean.allocationConsumed).toBeUndefined();
				}
				const fields = deltasToUsageEventFields({
					fullSubject,
					deltas: baseline.deltas,
				});
				expect(json(fields)).toBe(
					json(
						baselineUsageEventFields({ fullSubject, deltas: baseline.deltas }),
					),
				);
			}
			expect(integerDraws).toBeGreaterThan(700);
		});

	for (const seed of [51, 52])
		test(`advanced context: lean equals baseline over draws and hand-made changes (seed ${seed})`, () => {
			const random = seededRandom(seed);
			let advanced = 0;
			let refused = 0;
			for (let n = 0; n < 1_500; n++) {
				const { context, request } = randomDraw({ random });
				const outcome = deductWithContext({ context, request });
				const changes =
					random() < 0.5
						? outcome.changes
						: deltasToRowChanges({
								context,
								deltas: randomDeltas({ context, random }),
							});
				if (random() < 0.1)
					changes.push({
						table: "customerProducts",
						op: "upsert",
						row: { id: "cp" },
					} as never);
				if (random() < 0.1 && changes[0]?.op === "increment")
					(changes[0] as { guard?: unknown }).guard = { balance: { gte: 0 } };
				const baseline = advanceDeductionContext({ context, changes });
				const lean = advanceDeductionContextLean({ context, changes });
				expect(json(lean)).toBe(json(baseline));
				if (baseline === null) refused++;
				else {
					advanced++;
					if (baseline === context) expect(lean).toBe(context);
				}
			}
			expect(advanced).toBeGreaterThan(500);
			expect(refused).toBeGreaterThan(50);
		});

	test("a track decision with the request built by the caller is the same decision", () => {
		const { fullSubject } = randomDraw({ random: seededRandom(31) });
		const command = createTrackCommand({ value: 3 });
		const request = trackCommandToDeductionRequest({ command });
		expect(json(computeTrackDecision({ fullSubject, command, request }))).toBe(
			json(computeTrackDecision({ fullSubject, command })),
		);
	});

	test("usage-event sums that would leave the safe-integer range match the Decimal fields", () => {
		const { fullSubject, context, request } = randomDraw({
			random: seededRandom(61),
		});
		const outcome = deductWithContext({ context, request });
		const [first] = outcome.deltas;
		if (!first) return;
		// Nine deltas near 2^50 on one row: exact one by one, past 2^53 together.
		const deltas = Array.from({ length: 9 }, () => ({
			...first,
			balanceDelta: -(2 ** 50),
		}));
		expect(json(deltasToUsageEventFields({ fullSubject, deltas }))).toBe(
			json(baselineUsageEventFields({ fullSubject, deltas })),
		);
	});

	test("values past 2^50 and fractions keep the Decimal outcome", () => {
		const { context, request } = randomDraw({ random: seededRandom(41) });
		for (const value of [2 ** 50 + 1, 2 ** 53, 1.5]) {
			const big: DeductionRequest = { ...request, value };
			expect(isIntegerDraw({ context, request: big })).toBe(false);
			const outcome = deductWithContext({ context, request: big });
			expect(outcome.requestedValue).toBe(value);
			expect(
				new Decimal(outcome.appliedValue).plus(outcome.remaining).toNumber(),
			).toBe(value);
		}
	});
});

/** `deltasToUsageEventFields` as the baseline computes it, whatever ENGINE_DIET says: a fraction forces that path. */
function baselineUsageEventFields({
	fullSubject,
	deltas,
}: {
	fullSubject: Parameters<typeof deltasToUsageEventFields>[0]["fullSubject"];
	deltas: DeductionDelta[];
}) {
	const probe: DeductionDelta = {
		table: "customerEntitlements",
		id: "__probe__",
		entityKey: null,
		balanceDelta: 0.5,
		usageDelta: 0,
		valueDelta: 0,
		creditCost: 1,
	};
	// The probe names no row, so it adds nothing; its fraction only disables the lean path.
	return deltasToUsageEventFields({ fullSubject, deltas: [...deltas, probe] });
}
