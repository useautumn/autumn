import { expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import {
	billingCycleAnchorChanged,
	getPendingBillingCycleAnchor,
	pendingBillingCycleAnchorFormDefaults,
} from "@/components/forms/update-subscription-v2/utils/pendingBillingCycleAnchor";

const nowMs = Date.UTC(2026, 8, 22);
const futureMs = Date.UTC(2026, 9, 15, 9);

const cusProduct = (overrides: Partial<FullCusProduct>) =>
	({
		status: CusProductStatus.Active,
		billing_cycle_anchor_resets_at: futureMs,
		...overrides,
	}) as FullCusProduct;

test("returns a future scheduled anchor reset", () => {
	expect(
		getPendingBillingCycleAnchor({ cusProduct: cusProduct({}), nowMs }),
	).toBe(futureMs);
});

test("ignores a reset that already passed or was never scheduled", () => {
	expect(
		getPendingBillingCycleAnchor({
			cusProduct: cusProduct({ billing_cycle_anchor_resets_at: nowMs - 1 }),
			nowMs,
		}),
	).toBeNull();
	expect(
		getPendingBillingCycleAnchor({
			cusProduct: cusProduct({ billing_cycle_anchor_resets_at: null }),
			nowMs,
		}),
	).toBeNull();
});

test("ignores a reset on an expired plan", () => {
	expect(
		getPendingBillingCycleAnchor({
			cusProduct: cusProduct({ status: CusProductStatus.Expired }),
			nowMs,
		}),
	).toBeNull();
});

test("form defaults turn the anchor on with the scheduled custom date", () => {
	expect(
		pendingBillingCycleAnchorFormDefaults({
			cusProduct: cusProduct({}),
			nowMs,
		}),
	).toEqual({
		resetBillingCycle: true,
		billingCycleAnchorMode: "custom",
		billingCycleAnchorDate: futureMs,
	});
});

test("form defaults stay off without a scheduled anchor", () => {
	expect(
		pendingBillingCycleAnchorFormDefaults({
			cusProduct: cusProduct({ billing_cycle_anchor_resets_at: null }),
			nowMs,
		}),
	).toEqual({
		resetBillingCycle: false,
		billingCycleAnchorMode: "now",
		billingCycleAnchorDate: null,
	});
});

test("an untouched prefilled anchor is not a change", () => {
	expect(
		billingCycleAnchorChanged({
			formValues: {
				resetBillingCycle: true,
				billingCycleAnchorMode: "custom",
				billingCycleAnchorDate: futureMs,
			},
			pendingResetsAt: futureMs,
		}),
	).toBe(false);
});

test("moving the date or switching to now is a change", () => {
	expect(
		billingCycleAnchorChanged({
			formValues: {
				resetBillingCycle: true,
				billingCycleAnchorMode: "custom",
				billingCycleAnchorDate: futureMs + 1000,
			},
			pendingResetsAt: futureMs,
		}),
	).toBe(true);
	expect(
		billingCycleAnchorChanged({
			formValues: {
				resetBillingCycle: true,
				billingCycleAnchorMode: "now",
				billingCycleAnchorDate: futureMs,
			},
			pendingResetsAt: futureMs,
		}),
	).toBe(true);
});

test("turning the toggle off keeps the scheduled reset and is not a change", () => {
	expect(
		billingCycleAnchorChanged({
			formValues: {
				resetBillingCycle: false,
				billingCycleAnchorMode: "custom",
				billingCycleAnchorDate: futureMs,
			},
			pendingResetsAt: futureMs,
		}),
	).toBe(false);
});

test("without a scheduled anchor, enabling the toggle is the change", () => {
	expect(
		billingCycleAnchorChanged({
			formValues: {
				resetBillingCycle: false,
				billingCycleAnchorMode: "now",
				billingCycleAnchorDate: null,
			},
			pendingResetsAt: null,
		}),
	).toBe(false);
	expect(
		billingCycleAnchorChanged({
			formValues: {
				resetBillingCycle: true,
				billingCycleAnchorMode: "now",
				billingCycleAnchorDate: null,
			},
			pendingResetsAt: null,
		}),
	).toBe(true);
});
