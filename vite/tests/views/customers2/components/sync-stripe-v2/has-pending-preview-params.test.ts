import { expect, test } from "bun:test";
import type { SyncParamsV1 } from "@autumn/shared";
import { hasPendingPreviewParams } from "@/views/customers2/components/sync-stripe-v2/hasPendingPreviewParams";

const syncParams = ({ planId }: { planId: string }) =>
	({
		customer_id: "cus_1",
		stripe_subscription_id: "sub_1",
		phases: [{ starts_at: "now", plans: [{ plan_id: planId }] }],
	}) as unknown as SyncParamsV1;

test("an edited draft is pending until the debounced preview catches up", () => {
	expect(
		hasPendingPreviewParams({
			params: syncParams({ planId: "pro" }),
			debouncedParams: syncParams({ planId: "starter" }),
		}),
	).toBe(true);
});

test("an unchanged draft rebuilt as a new object is not pending", () => {
	expect(
		hasPendingPreviewParams({
			params: syncParams({ planId: "pro" }),
			debouncedParams: syncParams({ planId: "pro" }),
		}),
	).toBe(false);
});

test("a draft with no live subscription is never pending, since it is never previewed", () => {
	expect(
		hasPendingPreviewParams({
			params: {
				...syncParams({ planId: "pro" }),
				stripe_subscription_id: undefined,
			} as unknown as SyncParamsV1,
			debouncedParams: null,
		}),
	).toBe(false);
});
