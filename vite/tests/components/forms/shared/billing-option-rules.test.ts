import { describe, expect, test } from "bun:test";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";

const scheduleResetRule = (
	state: Parameters<typeof getBillingOptionRules>[0]["state"],
) => getBillingOptionRules({ flow: "schedule", state }).resetBillingCycle;

describe("schedule billing cycle reset rule", () => {
	test("shows the reset for a new schedule", () => {
		expect(scheduleResetRule({})).toMatchObject({
			visible: true,
			disabled: false,
		});
	});

	test("allows the reset when the first phase has several plans", () => {
		expect(scheduleResetRule({})).toMatchObject({ disabled: false });
	});
});
