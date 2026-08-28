import { expect, test } from "bun:test";
import { graduatedTiers } from "../../cases/traps/graduatedTiers.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("trap-graduated-tiers: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: graduatedTiers,
		configFile: graduatedTiers.goldenConfig,
	});
	expect(scores).toEqual({
		"config valid": 1,
		"plan count": 1,
		"plan: scale with graduated tiers": 1,
	});
});

test("trap-graduated-tiers: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: graduatedTiers });
	expect(scores).toEqual({
		"config valid": 0,
		"plan count": 0,
		"plan: scale with graduated tiers": 0,
	});
});
