import { expect, test } from "bun:test";
import { getAttachProrationVisibility } from "@/components/forms/attach-v2/utils/attachProrationBehaviorRules";

test("multi-plan proration stays visible despite a stale single-plan schedule", () => {
	expect(
		getAttachProrationVisibility({
			hasSubscriptionToProrate: true,
			isMultiPlan: true,
			planSchedule: "end_of_cycle",
		}),
	).toEqual({
		showProrationRow: true,
		showProrationBehavior: true,
	});
});

test("single-plan proration follows its selected schedule", () => {
	expect(
		getAttachProrationVisibility({
			hasSubscriptionToProrate: true,
			isMultiPlan: false,
			planSchedule: "end_of_cycle",
		}),
	).toEqual({
		showProrationRow: true,
		showProrationBehavior: false,
	});
});
