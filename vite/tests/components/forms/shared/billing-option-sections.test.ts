import { describe, expect, test } from "bun:test";
import { FreeTrialDuration } from "@autumn/shared";
import type { BillingOptionDescriptor } from "@/components/forms/shared/billing-option-sections/types/billingOptionSectionTypes";
import {
	anchorSummary,
	catalogTrialSummary,
	changedTo,
	prorationSummary,
	staysAs,
	versionSummary,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionSummaries";
import {
	summarizeBillingOptions,
	toVisibleBillingOptionSections,
} from "@/components/forms/shared/billing-option-sections/utils/toVisibleBillingOptionSections";

const option = (
	overrides: Partial<BillingOptionDescriptor>,
): BillingOptionDescriptor => ({
	id: "option",
	visible: true,
	summary: null,
	row: "row",
	...overrides,
});

describe("toVisibleBillingOptionSections", () => {
	test("drops sections whose options are all hidden and keeps display order", () => {
		const sections = toVisibleBillingOptionSections({
			sections: {
				stripe: [option({ id: "skipBilling" })],
				balances: [option({ id: "resetUsage", visible: false })],
				charges: [option({ id: "proration" })],
				plan: [option({ id: "version" })],
			},
		});
		expect(sections.map((section) => section.id)).toEqual([
			"plan",
			"charges",
			"stripe",
		]);
	});

	test("a section of summary-only facts is not rendered", () => {
		expect(
			toVisibleBillingOptionSections({
				sections: {
					timing: [
						option({ row: undefined, summary: staysAs("Renews Nov 6") }),
					],
				},
			}),
		).toEqual([]);
	});

	test("facts join the summary but render no row", () => {
		const [timing] = toVisibleBillingOptionSections({
			sections: {
				timing: [
					option({ id: "endDate", summary: null }),
					option({
						id: "renews",
						row: undefined,
						summary: staysAs("Renews Nov 6"),
					}),
				],
			},
		});
		expect(timing.options.map((entry) => entry.id)).toEqual(["endDate"]);
		expect(timing.summary).toEqual([{ text: "Renews Nov 6", changed: false }]);
	});
});

describe("summarizeBillingOptions", () => {
	test("lists changed parts first, then what stays the same, in row order", () => {
		expect(
			summarizeBillingOptions({
				options: [
					option({ id: "a", summary: staysAs("Starts now") }),
					option({ id: "b", summary: changedTo("Ends Dec 1") }),
					option({ id: "c", summary: staysAs("Renews Nov 6") }),
				],
			}),
		).toEqual([
			{ text: "Ends Dec 1", changed: true },
			{ text: "Starts now", changed: false },
			{ text: "Renews Nov 6", changed: false },
		]);
	});

	test("a locked option reads as unchanged and a hidden one is left out", () => {
		expect(
			summarizeBillingOptions({
				options: [
					option({
						id: "a",
						summary: changedTo("Cycle resets now"),
						locked: true,
					}),
					option({ id: "b", summary: changedTo("Ends Nov 1"), visible: false }),
				],
			}),
		).toEqual([{ text: "Cycle resets now", changed: false }]);
	});
});

describe("summary phrases", () => {
	test("proration reads its effective mode and flags a change from the flow default", () => {
		expect(prorationSummary({ value: "none", defaultValue: "none" })).toEqual(
			staysAs("No proration"),
		);
		expect(
			prorationSummary({ value: "prorate_immediately", defaultValue: "none" }),
		).toEqual(changedTo("Prorated"));
		expect(
			prorationSummary({
				value: "none",
				defaultValue: "none",
				labels: { none: "Backdated time not billed" },
			}),
		).toEqual(staysAs("Backdated time not billed"));
	});

	test("the anchor keeps its default text until it resets", () => {
		expect(
			anchorSummary({
				enabled: false,
				mode: "now",
				customAnchor: null,
				defaultText: "Keeps cycle",
			}),
		).toEqual(staysAs("Keeps cycle"));
		expect(
			anchorSummary({ enabled: true, mode: "now", customAnchor: null }),
		).toEqual(changedTo("Cycle resets now"));
		expect(
			anchorSummary({ enabled: true, mode: "custom", customAnchor: null }),
		).toBeNull();
	});

	test("a trial matching the catalog trial is not a change", () => {
		const catalogTrial = { length: 14, duration: FreeTrialDuration.Day };
		expect(
			catalogTrialSummary({
				enabled: true,
				length: 14,
				duration: FreeTrialDuration.Day,
				catalogTrial,
			}),
		).toEqual(staysAs("14-day trial"));
		expect(
			catalogTrialSummary({
				enabled: false,
				length: 14,
				duration: FreeTrialDuration.Day,
				catalogTrial,
			}),
		).toEqual(changedTo("No trial"));
	});

	test("the version names the default it compares against", () => {
		expect(
			versionSummary({
				version: undefined,
				defaultVersion: 3,
				defaultLabel: "latest",
			}),
		).toEqual(staysAs("Version 3 (latest)"));
		expect(
			versionSummary({ version: 2, defaultVersion: 3, defaultLabel: "latest" }),
		).toEqual(changedTo("Version 2"));
	});
});
