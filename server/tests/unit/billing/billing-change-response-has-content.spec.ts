import { describe, expect, test } from "bun:test";
import type { BillingChangeResponse, CustomerPlanChange } from "@autumn/shared";
import { billingChangeResponseHasContent } from "@/internal/billing/v2/utils/billingChangeResponse/billingChangeResponseHasContent";

const makeResponse = ({
	planChanges = 0,
	tags = [],
}: {
	planChanges?: number;
	tags?: string[];
}): BillingChangeResponse =>
	({
		object: "billing.updated",
		customer_id: "cus_test",
		plan_changes: Array.from(
			{ length: planChanges },
			() => ({ action: "updated" }) as CustomerPlanChange,
		),
		tags,
	}) as BillingChangeResponse;

describe("billingChangeResponseHasContent", () => {
	test("false when there are no plan changes and no tags", () => {
		expect(billingChangeResponseHasContent(makeResponse({}))).toBe(false);
	});

	test("true when there are plan changes", () => {
		expect(
			billingChangeResponseHasContent(makeResponse({ planChanges: 1 })),
		).toBe(true);
	});

	test("true for a tag-only transition like trial_ended (no plan changes)", () => {
		expect(
			billingChangeResponseHasContent(makeResponse({ tags: ["trial_ended"] })),
		).toBe(true);
	});

	test("true when both plan changes and tags are present", () => {
		expect(
			billingChangeResponseHasContent(
				makeResponse({ planChanges: 1, tags: ["phase_changed"] }),
			),
		).toBe(true);
	});
});
