/**
 * The lean track paths must give byte-for-byte what the baseline gives: row changes and the advanced
 * context are compared as JSON over random draws (integers, fractions, entities, attribution, rollovers,
 * rejections) and hand-made changes; the request handed in by the caller must change nothing.
 */
import { describe, expect, test } from "bun:test";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { computeTrackDecision } from "../../../src/commands/track/computeTrack.js";
import { trackCommandToDeductionRequest } from "../../../src/commands/track/trackCommandToDeductionRequest.js";
import { advanceDeductionContext } from "../../../src/deduction/advanceDeductionContext.js";
import { advanceDeductionContextLean } from "../../../src/deduction/advanceDeductionContextLean.js";
import { deductWithContext } from "../../../src/deduction/deduct.js";
import { setupDeductionContext } from "../../../src/deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../../src/deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../../src/deduction/types/deductionDelta.js";
import { deltasToRowChanges } from "../../../src/deduction/utils/convertDeductionUtils.js";
import { deltasToRowChangesLean } from "../../../src/deduction/utils/deltasToRowChangesLean.js";
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
});
