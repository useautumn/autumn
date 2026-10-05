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

	test("disables the reset for a new schedule opening with several plans", () => {
		expect(
			scheduleResetRule({ hasMultipleImmediatePlans: true }),
		).toMatchObject({ visible: true, disabled: true });
	});

	test("hides the reset for a saved schedule, whose later phases pick their own", () => {
		expect(
			scheduleResetRule({
				hasPersistedSchedule: true,
				hasMultipleImmediatePlans: true,
			}).visible,
		).toBe(false);
	});
});
