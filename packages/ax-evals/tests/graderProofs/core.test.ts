/**
 * Grader proofs: a case's golden config must score 1 on every config
 * expectation; an empty workspace must score 0. Proven here in ms so a
 * broken grader is never debugged through a live agent run.
 */
import { expect, test } from "bun:test";
import { writingAssistant } from "../../cases/core/freeAndProWithOverage.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("writing-assistant: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: writingAssistant,
		configFile: writingAssistant.goldenConfig,
	});

	expect(scores).toEqual({
		"config valid": 1,
		"plan count": 1,
		"plan: free tier": 1,
		"plan: pro with overage": 1,
	});
});

test("writing-assistant: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: writingAssistant });

	expect(scores).toEqual({
		"config valid": 0,
		"plan count": 0,
		"plan: free tier": 0,
		"plan: pro with overage": 0,
	});
});
