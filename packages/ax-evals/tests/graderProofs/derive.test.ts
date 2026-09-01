/**
 * Grader proofs for the derive tier: the golden config passes every catalog
 * verdict, an empty workspace fails them all. Proves the scorers — never the
 * skill's wording.
 */
import { expect, test } from "bun:test";
import { sharedCreditsAddOn } from "../../cases/derive/sharedCreditsAddOn.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("shared-credits-add-on: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: sharedCreditsAddOn,
		configFile: sharedCreditsAddOn.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro with 10k credits": 1,
		"has plan: credit pack as add-on": 1,
		"has feature: ai credits (credit system)": 1,
	});
});

test("shared-credits-add-on: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: sharedCreditsAddOn,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: pro with 10k credits": 0,
		"has plan: credit pack as add-on": 0,
		"has feature: ai credits (credit system)": 0,
	});
});
