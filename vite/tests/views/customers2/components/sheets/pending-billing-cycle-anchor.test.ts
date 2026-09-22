import { expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import {
	billingCycleAnchorFormOverrides,
	getPendingBillingCycleAnchor,
} from "@/views/customers2/components/sheets/subscriptionDetailUtils";

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

test("prefills the update form with the scheduled custom anchor", () => {
	expect(billingCycleAnchorFormOverrides({ resetsAt: futureMs })).toEqual({
		resetBillingCycle: true,
		billingCycleAnchorMode: "custom",
		billingCycleAnchorDate: futureMs,
	});
});
