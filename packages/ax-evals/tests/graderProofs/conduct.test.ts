import { expect, test } from "bun:test";
import { addPlan } from "../../cases/conduct/addPlan.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("conduct-add-plan: golden (pro + team) passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: addPlan,
		configFile: addPlan.goldenConfig,
	});
	expect(scores).toEqual({
		"config valid": 1,
		"plan count": 1,
		"plan: existing pro untouched": 1,
		"plan: new team plan": 1,
	});
});

test("conduct-add-plan: the SEEDED config alone (pro only) fails the new-plan expectations", async () => {
	const scores = await scoreConfigExpectations({
		axCase: addPlan,
		configFile: addPlan.existingFiles?.["autumn.config.ts"],
	});
	expect(scores).toEqual({
		"config valid": 1,
		"plan count": 0,
		"plan: existing pro untouched": 1,
		"plan: new team plan": 0,
	});
});
