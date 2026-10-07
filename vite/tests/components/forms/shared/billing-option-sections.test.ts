import { describe, expect, test } from "bun:test";
import type { BillingOptionDescriptor } from "@/components/forms/shared/billing-option-sections/types/billingOptionSectionTypes";
import {
	billingCycleAnchorChange,
	prorationChange,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionChanges";
import {
	summarizeBillingOptions,
	toVisibleBillingOptionSections,
} from "@/components/forms/shared/billing-option-sections/utils/toVisibleBillingOptionSections";

const option = (
	overrides: Partial<BillingOptionDescriptor>,
): BillingOptionDescriptor => ({
	id: "option",
	visible: true,
	change: null,
	row: null,
	...overrides,
});

describe("toVisibleBillingOptionSections", () => {
	test("drops sections whose options are all hidden and keeps display order", () => {
		const sections = toVisibleBillingOptionSections({
			sections: {
				stripe: [option({ id: "skipBilling" })],
				balances: [option({ id: "resetUsage", visible: false })],
				charges: [option({ id: "proration" })],
			},
		});
		expect(sections.map((section) => section.id)).toEqual([
			"charges",
			"stripe",
		]);
	});

	test("returns nothing when no option is visible", () => {
		expect(
			toVisibleBillingOptionSections({
				sections: { timing: [option({ visible: false })] },
			}),
		).toEqual([]);
	});
});

describe("summarizeBillingOptions", () => {
	test("shows Default when nothing changed", () => {
		expect(summarizeBillingOptions({ options: [option({})] })).toBe("Default");
	});

	test("joins changes in row order and capitalises the first", () => {
		expect(
			summarizeBillingOptions({
				options: [
					option({ id: "a", change: "end of cycle" }),
					option({ id: "b", change: "anchor now" }),
				],
			}),
		).toBe("End of cycle · anchor now");
	});

	test("ignores locked and hidden options", () => {
		expect(
			summarizeBillingOptions({
				options: [
					option({ id: "a", change: "anchor now", locked: true }),
					option({ id: "b", change: "end Nov 1", visible: false }),
				],
			}),
		).toBe("Default");
	});
});

describe("change phrases", () => {
	test("proration only counts when it differs from the flow default", () => {
		expect(prorationChange({ value: "none", defaultValue: "none" })).toBeNull();
		expect(
			prorationChange({
				value: "prorate_immediately",
				defaultValue: "none",
			}),
		).toBe("prorated");
		expect(
			prorationChange({
				value: "none",
				defaultValue: "prorate_immediately",
			}),
		).toBe("no proration");
	});

	test("a custom anchor without a date is not a change", () => {
		expect(
			billingCycleAnchorChange({
				enabled: true,
				mode: "custom",
				customAnchor: null,
			}),
		).toBeNull();
		expect(
			billingCycleAnchorChange({
				enabled: true,
				mode: "now",
				customAnchor: null,
			}),
		).toBe("anchor now");
	});
});
