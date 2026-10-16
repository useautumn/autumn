/** Contract: the new filter rows get inputs: entity type picks features, the cycle anchor picks now / unchanged / custom, has-paid is yes or no. */

import { describe, expect, test } from "bun:test";
import type { EditorField } from "@autumn/shared/api/approvals/editor/index";
import { valueInputOf } from "@/views/settings/sections/approvals/editor/ruleRowCodec";
import { OPTION_HOOKS } from "@/views/settings/sections/approvals/editor/values/useValueOptions";

describe("editor value inputs", () => {
	test.each<[EditorField, string]>([
		["entity", "feature"],
		["billing_cycle_anchor", "billing_cycle_anchor"],
		["customer_has_paid", "yes_no"],
		["free_trial", "trial"],
	])("%s uses the %s input", (field, input) => {
		expect(valueInputOf(field)).toBe(input);
	});

	test("the cycle anchor offers its three values in words", () => {
		expect(OPTION_HOOKS.billing_cycle_anchor()).toEqual([
			{ value: "now", label: "Reset now" },
			{ value: "unchanged", label: "Unchanged" },
			{ value: "custom", label: "Custom date" },
		]);
	});
});
