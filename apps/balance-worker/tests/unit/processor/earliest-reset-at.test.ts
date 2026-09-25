import { expect, test } from "bun:test";
import {
	earliestResetAt,
	resetMayBeDue,
} from "../../../src/processor/actions/ensureSubjectCurrent/earliestResetAt.js";
import {
	createCustomerEntitlement,
	createState,
} from "../../fixtures/mutations.js";

test("the horizon is the earliest cycle end; nothing is due at or before it", () => {
	const state = createState({
		customerEntitlements: [
			{ ...createCustomerEntitlement({ id: "a" }), next_reset_at: 2_000 },
			{ ...createCustomerEntitlement({ id: "b" }), next_reset_at: 1_000 },
			{ ...createCustomerEntitlement({ id: "c" }), next_reset_at: null },
		],
	});
	expect(earliestResetAt({ state })).toBe(1_000);
	expect(resetMayBeDue({ state, asOf: 999 })).toBe(false);
	// A reset refills rows whose cycle ended strictly before the clock.
	expect(resetMayBeDue({ state, asOf: 1_000 })).toBe(false);
	expect(resetMayBeDue({ state, asOf: 1_001 })).toBe(true);
});

test("a state with no cycle ends is never due, and the answer is memoised per state object", () => {
	const state = createState({
		customerEntitlements: [
			{ ...createCustomerEntitlement({ id: "a" }), next_reset_at: null },
		],
	});
	expect(earliestResetAt({ state })).toBeNull();
	expect(resetMayBeDue({ state, asOf: Number.MAX_SAFE_INTEGER })).toBe(false);
	// The rows are never edited in place; a changed row means a new state, and a new state a new answer.
	const later = {
		...state,
		customerEntitlements: [
			{ ...createCustomerEntitlement({ id: "a" }), next_reset_at: 5 },
		],
	};
	expect(earliestResetAt({ state: later })).toBe(5);
	expect(earliestResetAt({ state })).toBeNull();
});
