import { describe, expect, test } from "bun:test";
import { isCollectionMethodSwitch } from "./updateSubscriptionV1Params";

const base = {
	customer_id: "cus_123",
	plan_id: "pro",
	invoice_mode: { enabled: true },
};

describe("isCollectionMethodSwitch", () => {
	test("invoice_mode with only targeting and response keys is a switch", () => {
		expect(isCollectionMethodSwitch(base)).toBe(true);
		expect(
			isCollectionMethodSwitch({ ...base, redirect_mode: "if_required" }),
		).toBe(true);
	});

	test("any other mutation disqualifies the switch", () => {
		expect(
			isCollectionMethodSwitch({ ...base, free_trial: { duration_length: 7 } }),
		).toBe(false);
		expect(
			isCollectionMethodSwitch({ ...base, subscription_params: { a: 1 } }),
		).toBe(false);
		expect(isCollectionMethodSwitch({ ...base, feature_quantities: [] })).toBe(
			false,
		);
	});

	test("no invoice_mode is not a switch", () => {
		expect(
			isCollectionMethodSwitch({ customer_id: "cus_123", plan_id: "pro" }),
		).toBe(false);
	});
});
