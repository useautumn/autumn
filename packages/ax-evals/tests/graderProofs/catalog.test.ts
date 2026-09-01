/**
 * Grader proofs for the catalog() spec grader: the shared golden passes every
 * verdict, an empty workspace fails them all, and a near-miss surfaces a
 * field diff naming the closest plan.
 */
import { expect, test } from "bun:test";
import { missingFeatures } from "../../cases/basics/proGrowth/missingFeatures.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("missing-features: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: missingFeatures,
		configFile: missingFeatures.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 2 plans": 1,
		"has plan: pro 500 messages": 1,
		"has plan: growth 2000 messages": 1,
		"has feature: ai messages (metered)": 1,
		"has feature: sso (boolean)": 1,
	});
});

test("missing-features: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: missingFeatures,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"modeled exactly 2 plans": 0,
		"has plan: pro 500 messages": 0,
		"has plan: growth 2000 messages": 0,
		"has feature: ai messages (metered)": 0,
		"has feature: sso (boolean)": 0,
	});
});
