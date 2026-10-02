/**
 * Allocation maths: a deployment's granted share, the scale applied when the
 * shared pot can't cover every promise, the deduction gate, and first-call gap packing.
 */

import { describe, expect, test } from "bun:test";
import {
	allocationGate,
	allocationGranted,
	packAllocationGap,
	pickAllocationParent,
	solveAllocationScale,
} from "../../../src/allocations/allocationMath.js";

describe("solveAllocationScale", () => {
	test("is 1 while the pot covers every unused promise", () => {
		expect(
			solveAllocationScale({
				sharedRemaining: 6000,
				entries: [
					{ requested: 5000, usage: 4000 },
					{ requested: 5000, usage: 0 },
				],
			}),
		).toBe(1);
	});

	test("shrinks every share by the same proportion, never below usage (PRD §6)", () => {
		const scale = solveAllocationScale({
			sharedRemaining: 4000,
			entries: [
				{ requested: 5000, usage: 4000 },
				{ requested: 5000, usage: 0 },
			],
		});
		expect(scale).toBeCloseTo(0.8, 10);
	});

	test("puts the whole cut on entities that still have headroom", () => {
		const scale = solveAllocationScale({
			sharedRemaining: 3000,
			entries: [
				{ requested: 5000, usage: 5000 },
				{ requested: 5000, usage: 0 },
			],
		});
		expect(scale).toBeCloseTo(0.6, 10);
	});

	test("with nothing shared left, shrinks each share down to its usage", () => {
		const scale = solveAllocationScale({
			sharedRemaining: 0,
			entries: [{ requested: 5000, usage: 1000 }],
		});
		expect(scale).toBeCloseTo(0.2, 10);
		expect(allocationGranted({ requested: 5000, usage: 1000, scale })).toBe(
			1000,
		);
	});
});

describe("allocationGranted", () => {
	test("is the requested amount at full scale", () => {
		expect(allocationGranted({ requested: 5000, usage: 4000, scale: 1 })).toBe(
			5000,
		);
	});

	test("rounds a scaled share down to whole credits", () => {
		expect(allocationGranted({ requested: 5000, usage: 0, scale: 2 / 3 })).toBe(
			3333,
		);
	});

	test("a share the scale cuts to a whole number stays whole despite float error", () => {
		const scale = solveAllocationScale({
			sharedRemaining: 15000,
			entries: [
				{ requested: 12000, usage: 5000 },
				{ requested: 10000, usage: 0 },
				{ requested: 8000, usage: 0 },
			],
		});
		expect(
			[12000, 10000, 8000].map((requested) =>
				allocationGranted({ requested, usage: 0, scale }),
			),
		).toEqual([8000, 6666, 5333]);
	});

	test("never drops below what's already been used", () => {
		expect(
			allocationGranted({ requested: 5000, usage: 4000, scale: 0.6 }),
		).toBe(4000);
	});
});

describe("allocationGate", () => {
	test("own unused plus whatever nobody holds", () => {
		expect(
			allocationGate({
				own: { requested: 5000, usage: 1000 },
				scale: 1,
				heldUnused: 6000,
				sharedRemaining: 9000,
			}),
		).toEqual({ ownUnused: 4000, unallocated: 3000 });
	});

	test("an entity without a share only sees unallocated credits", () => {
		expect(
			allocationGate({
				own: null,
				scale: 1,
				heldUnused: 10000,
				sharedRemaining: 10000,
			}),
		).toEqual({ ownUnused: 0, unallocated: 0 });
	});

	test("nothing is unallocated once shares have been scaled down", () => {
		expect(
			allocationGate({
				own: { requested: 5000, usage: 0 },
				scale: 0.8,
				heldUnused: 10000,
				sharedRemaining: 8000,
			}),
		).toEqual({ ownUnused: 4000, unallocated: 0 });
	});

	test("a cut scale reads as 1 once the pot covers every unused promise", () => {
		expect(
			allocationGate({
				own: { requested: 5000, usage: 0 },
				scale: 0.8,
				heldUnused: 10000,
				sharedRemaining: 10500,
			}),
		).toEqual({ ownUnused: 5000, unallocated: 500 });
	});
});

describe("packAllocationGap", () => {
	test("the last entries absorb the gap so the first stay whole", () => {
		expect(
			packAllocationGap({
				gap: 4000,
				entries: [
					{ entityId: "a", amount: 5000 },
					{ entityId: "b", amount: 5000 },
				],
			}),
		).toEqual({ a: 0, b: 4000 });
	});

	test("spills into earlier entries once a later one is full", () => {
		expect(
			packAllocationGap({
				gap: 7000,
				entries: [
					{ entityId: "a", amount: 5000 },
					{ entityId: "b", amount: 5000 },
				],
			}),
		).toEqual({ a: 2000, b: 5000 });
	});

	test("a gap bigger than every share fills every share", () => {
		expect(
			packAllocationGap({
				gap: 20000,
				entries: [
					{ entityId: "a", amount: 5000 },
					{ entityId: "b", amount: 1000 },
				],
			}),
		).toEqual({ a: 5000, b: 1000 });
	});
});

describe("pickAllocationParent", () => {
	const base = { id: "base", next_reset_at: 15 };
	const addOn = { id: "addon", next_reset_at: 3 };
	test("keeps the pinned row while it exists, whichever resets sooner", () => {
		expect(
			pickAllocationParent({ sharedRows: [base, addOn], pinnedId: "base" })?.id,
		).toBe("base");
	});
	test("re-picks when the pinned row is gone", () => {
		expect(
			pickAllocationParent({ sharedRows: [addOn], pinnedId: "base" })?.id,
		).toBe("addon");
	});
});
