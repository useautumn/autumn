import { expect, test } from "bun:test";
import { clearCredits } from "../../cases/ambiguity/clearCredits.eval.ts";
import { inferInterval } from "../../cases/ambiguity/inferInterval.eval.ts";
import { vagueCredits } from "../../cases/ambiguity/vagueCredits.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

const CREDITS_SCORES = {
	"config valid": 1,
	"plan count": 1,
	"plan: pro with monthly credits": 1,
};

test("vague-credits: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: vagueCredits,
		configFile: vagueCredits.goldenConfig,
	});
	expect(scores).toEqual(CREDITS_SCORES);
});

test("clear-credits (twin): shares the vague-credits golden and scores", async () => {
	const scores = await scoreConfigExpectations({
		axCase: clearCredits,
		configFile: clearCredits.goldenConfig,
	});
	expect(scores).toEqual(CREDITS_SCORES);
});

test("infer-interval: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: inferInterval,
		configFile: inferInterval.goldenConfig,
	});
	expect(scores).toEqual({
		"config valid": 1,
		"plan count": 1,
		"plan: pro with monthly messages": 1,
	});
});

test("ambiguity cases: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: vagueCredits });
	expect(scores).toEqual({
		"config valid": 0,
		"plan count": 0,
		"plan: pro with monthly credits": 0,
	});
});
