import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import { billingContextToApprovalAction } from "@/internal/approvals/check/billingContextToApprovalAction";
import type { BillingRoute } from "@/internal/approvals/check/types/billingRoute";

const contextWith = (cancelAction?: BillingContext["cancelAction"]) =>
	({ cancelAction }) as BillingContext;

describe("billingContextToApprovalAction", () => {
	test.each([
		["billing.attach", undefined, "billing.attach"],
		["billing.multi_attach", undefined, "billing.attach"],
		["billing.update", undefined, "billing.update"],
		["billing.update", "cancel_end_of_cycle", "billing.cancel"],
		["billing.update", "cancel_immediately", "billing.cancel"],
		["billing.update", "uncancel", "billing.uncancel"],
		["billing.multi_update", "cancel_immediately", "billing.cancel"],
		["billing.multi_update", undefined, "billing.update"],
		["billing.set_plans", undefined, "billing.set_plans"],
		["billing.create_schedule", undefined, "billing.create_schedule"],
	] as const)("%s with %s is judged as %s", (route, cancelAction, expected) => {
		expect(
			billingContextToApprovalAction({
				billingContext: contextWith(cancelAction),
				route: route as BillingRoute,
			}),
		).toBe(expected);
	});
});
