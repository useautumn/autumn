/**
 * Grader proofs for the pro/growth basics archetype: the shared golden passes
 * every catalog verdict of each case; an empty workspace fails them all.
 */
import { expect, test } from "bun:test";
import { clear } from "../../cases/basics/proGrowth/clear.eval.ts";
import { missingPrice } from "../../cases/basics/proGrowth/missingPrice.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

const ALL_PASS = {
	"config parses and passes validation": 1,
	"modeled exactly 2 plans": 1,
	"has plan: pro 500 messages": 1,
	"has plan: growth 2000 messages": 1,
	"has feature: ai messages (metered)": 1,
	"has feature: sso (boolean)": 1,
};

const ALL_FAIL = Object.fromEntries(
	Object.keys(ALL_PASS).map((name) => [name, 0]),
);

test("clear: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: clear,
		configFile: clear.goldenConfig,
	});
	expect(scores).toEqual(ALL_PASS);
});

test("clear: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: clear });
	expect(scores).toEqual(ALL_FAIL);
});

test("missing-price: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: missingPrice,
		configFile: missingPrice.goldenConfig,
	});
	expect(scores).toEqual(ALL_PASS);
});

test("missing-price: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: missingPrice });
	expect(scores).toEqual(ALL_FAIL);
});
