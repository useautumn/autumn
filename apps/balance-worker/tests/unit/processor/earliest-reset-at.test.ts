import { expect, test } from "bun:test";
import type { WorkerUsageWindow } from "@autumn/balance-engine";
import { CusProductStatus } from "@autumn/shared";
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

const usageWindow = ({
	windowEndAt = 10_000,
	anchorCustomerEntitlementId = "a",
}: {
	windowEndAt?: number;
	anchorCustomerEntitlementId?: string | null;
} = {}): WorkerUsageWindow => ({
	id: "uw_1",
	internal_customer_id: "cus_internal_1",
	internal_entity_id: null,
	feature_id: "messages",
	internal_feature_id: "feat_messages",
	filter_key: null,
	anchor_customer_entitlement_id: anchorCustomerEntitlementId,
	window_start_at: 0,
	window_end_at: windowEndAt,
	usage: 1,
	updated_at: 0,
});

const stateWithWindow = ({
	window,
	productStatus = CusProductStatus.Active,
}: {
	window: WorkerUsageWindow;
	productStatus?: CusProductStatus;
}) => {
	const state = createState({
		customerEntitlements: [
			{ ...createCustomerEntitlement({ id: "a" }), next_reset_at: null },
		],
	});
	return {
		...state,
		customerProducts: state.customerProducts.map((product) => ({
			...product,
			status: productStatus,
		})),
		usageWindows: [window],
	};
};

test("a usage-window counter falls due when its window closes", () => {
	const state = stateWithWindow({
		window: usageWindow({ windowEndAt: 1_000 }),
	});
	expect(resetMayBeDue({ state, asOf: 999 })).toBe(false);
	// A window's end is exclusive: the counter rolls at its end, not after it.
	expect(resetMayBeDue({ state, asOf: 1_000 })).toBe(true);
});

test("a counter anchored to a row that left the subject or ended with its plan falls due", () => {
	expect(
		resetMayBeDue({
			state: stateWithWindow({
				window: usageWindow({ anchorCustomerEntitlementId: "gone" }),
			}),
			asOf: 1,
		}),
	).toBe(true);
	expect(
		resetMayBeDue({
			state: stateWithWindow({
				window: usageWindow(),
				productStatus: CusProductStatus.Expired,
			}),
			asOf: 1,
		}),
	).toBe(true);
	expect(
		resetMayBeDue({
			state: stateWithWindow({ window: usageWindow() }),
			asOf: 1,
		}),
	).toBe(false);
});
