/**
 * Grader proofs for the misc/display suite: the golden config passes every
 * catalog verdict; an empty workspace fails them all. (Judge checks are
 * prose-only and aren't provable without an agent.)
 */
import { expect, test } from "bun:test";
import { displayItemTypes } from "../../cases/misc/displayItemTypes.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("display-item-types: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: displayItemTypes,
		configFile: displayItemTypes.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: free 100 messages": 1,
		"has plan: pro with overage": 1,
		"has plan: message pack add-on": 1,
		"has feature: messages (metered)": 1,
		"has feature: sso (boolean)": 1,
	});
});

test("display-item-types: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: displayItemTypes });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: free 100 messages": 0,
		"has plan: pro with overage": 0,
		"has plan: message pack add-on": 0,
		"has feature: messages (metered)": 0,
		"has feature: sso (boolean)": 0,
	});
});
