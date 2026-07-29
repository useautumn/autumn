/**
 * Pins skip_overage_billing false ≡ unset for billing-control change detection
 * (UI save-button dirty checks and backend plan-change decisioning).
 */

import { describe, expect, test } from "bun:test";
import {
	type CustomerBillingControls,
	compareBillingControls,
} from "@autumn/shared";

const capOnly: CustomerBillingControls = {
	spend_limits: [{ feature_id: "messages", enabled: true, overage_limit: 100 }],
};

const withSkip = (skipOverageBilling: boolean): CustomerBillingControls => ({
	spend_limits: [
		{
			feature_id: "messages",
			enabled: true,
			overage_limit: 100,
			skip_overage_billing: skipOverageBilling,
		},
	],
});

describe("compareBillingControls — skip_overage_billing normalization", () => {
	test("explicit false vs unset → same", () => {
		expect(
			compareBillingControls({
				newBillingControls: withSkip(false),
				curBillingControls: capOnly,
			}),
		).toBe(true);
	});

	test("explicit true vs unset → different", () => {
		expect(
			compareBillingControls({
				newBillingControls: withSkip(true),
				curBillingControls: capOnly,
			}),
		).toBe(false);
	});

	test("true vs false → different", () => {
		expect(
			compareBillingControls({
				newBillingControls: withSkip(true),
				curBillingControls: withSkip(false),
			}),
		).toBe(false);
	});
});
