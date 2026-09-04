/**
 * Grader proofs for the pro/growth basics archetype: the shared golden passes
 * every catalog verdict of each case; an empty workspace fails them all.
 */
import { expect, test } from "bun:test";
import { clear } from "../../cases/basics/proGrowth/clear.eval.ts";
import { lateFact } from "../../cases/basics/proGrowth/lateFact.eval.ts";
import { missingPrice } from "../../cases/basics/proGrowth/missingPrice.eval.ts";
import { writeFromStructure } from "../../cases/basics/proGrowth/writeFromStructure.eval.ts";
import { defaultTrial } from "../../cases/basics/trial/defaultTrial.eval.ts";
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

test("write-from-structure: golden passes, empty fails", async () => {
	const golden = await scoreConfigExpectations({
		axCase: writeFromStructure,
		configFile: writeFromStructure.goldenConfig,
	});
	expect(golden).toEqual(ALL_PASS);

	const empty = await scoreConfigExpectations({ axCase: writeFromStructure });
	expect(empty).toEqual(ALL_FAIL);
});

test("late-fact: golden (paid plans + free tier) passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: lateFact,
		configFile: lateFact.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 3 plans": 1,
		"has plan: existing pro untouched": 1,
		"has plan: existing growth untouched": 1,
		"has plan: free default tier 50 messages": 1,
	});
});

test("late-fact: the seeded config alone fails the free-tier verdicts", async () => {
	const scores = await scoreConfigExpectations({
		axCase: lateFact,
		configFile: lateFact.existingFiles?.["autumn.config.ts"],
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 3 plans": 0,
		"has plan: existing pro untouched": 1,
		"has plan: existing growth untouched": 1,
		"has plan: free default tier 50 messages": 0,
	});
});

test("default-trial: golden passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: defaultTrial,
		configFile: defaultTrial.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 2 plans": 1,
		"has plan: pro paid plan without the trial": 1,
		"has plan: separate free default plan carrying the no-card trial": 1,
		"has feature: ai messages (metered)": 1,
	});
});

test("default-trial: trial hung off the paid plan fails the default-plan verdict", async () => {
	const trialOnPaid = `import { feature, plan, item } from "atmn";

export const aiMessages = feature({
	id: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 30, interval: "month" },
	freeTrial: {
		durationType: "day",
		durationLength: 14,
		cardRequired: false,
	},
	items: [
		item({
			featureId: aiMessages.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});
`;
	const scores = await scoreConfigExpectations({
		axCase: defaultTrial,
		configFile: trialOnPaid,
	});

	expect(
		scores["has plan: separate free default plan carrying the no-card trial"],
	).toBe(0);
	expect(scores["has plan: pro paid plan without the trial"]).toBe(1);
	expect(scores["config parses and passes validation"]).toBe(1);
});
