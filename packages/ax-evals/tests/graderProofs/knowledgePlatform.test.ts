/**
 * Grader proofs for the knowledge-platform suite: the shared golden passes
 * every config verdict of each case; an empty workspace fails them all. The
 * packs-fork mutation proof is the point — packs duplicated onto base plans
 * must fail the negative anchor.
 */
import { expect, test } from "bun:test";
import { askAnnualReset } from "../../cases/suites/knowledgePlatform/askAnnualReset.eval.ts";
import { clearAnnualReset } from "../../cases/suites/knowledgePlatform/clearAnnualReset.eval.ts";
import { knowledgePlatformGoldenConfig } from "../../cases/suites/knowledgePlatform/knowledgePlatformPricing.ts";
import { oneShot } from "../../cases/suites/knowledgePlatform/oneShot.eval.ts";
import { seedPacksFork } from "../../cases/suites/knowledgePlatform/seedPacksFork.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("one-shot: golden config passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: oneShot,
		configFile: oneShot.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro monthly 5000 credits": 1,
		"has plan: growth annual with monthly credit reset": 1,
		"has plan: credit packs as separate prepaid add-on": 1,
		"has plan: overage priced somewhere": 1,
		"has feature: ai credits (credit system)": 1,
		"modeled exactly 5 plans": 1,
		"base plans carry no prepaid items": 1,
	});
});

test("one-shot: empty workspace fails every config verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: oneShot });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: pro monthly 5000 credits": 0,
		"has plan: growth annual with monthly credit reset": 0,
		"has plan: credit packs as separate prepaid add-on": 0,
		"has plan: overage priced somewhere": 0,
		"has feature: ai credits (credit system)": 0,
		"modeled exactly 5 plans": 0,
		"base plans carry no prepaid items": 0,
	});
});

test("ask-annual-reset: golden passes, empty fails", async () => {
	const golden = await scoreConfigExpectations({
		axCase: askAnnualReset,
		configFile: askAnnualReset.goldenConfig,
	});
	expect(golden).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro monthly 5000 credits": 1,
		"has plan: growth annual with monthly credit reset": 1,
		"base plans carry no prepaid items": 1,
	});

	const empty = await scoreConfigExpectations({ axCase: askAnnualReset });
	expect(empty).toEqual({
		"config parses and passes validation": 0,
		"has plan: pro monthly 5000 credits": 0,
		"has plan: growth annual with monthly credit reset": 0,
		"base plans carry no prepaid items": 0,
	});
});

test("ask-annual-reset: annual reset pattern-matched to yearly fails the annual plan verdict", async () => {
	const yearlyReset = knowledgePlatformGoldenConfig().replaceAll(
		'reset: { interval: "month" },',
		'reset: { interval: "year" },',
	);
	const scores = await scoreConfigExpectations({
		axCase: askAnnualReset,
		configFile: yearlyReset,
	});

	expect(scores["has plan: growth annual with monthly credit reset"]).toBe(0);
	expect(scores["config parses and passes validation"]).toBe(1);
});

test("clear-annual-reset: golden passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: clearAnnualReset,
		configFile: clearAnnualReset.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro monthly 5000 credits": 1,
		"has plan: growth annual with monthly credit reset": 1,
	});
});

test("seed-packs-fork: golden config passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedPacksFork,
		configFile: seedPacksFork.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: existing pro untouched": 1,
		"has plan: existing growth annual untouched": 1,
		"has plan: credit packs as separate prepaid add-on": 1,
		"modeled exactly 5 plans": 1,
		"base plans carry no prepaid items": 1,
	});
});

test("seed-packs-fork: the seeded base config alone fails the pack verdicts", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedPacksFork,
		configFile: seedPacksFork.existingFiles?.["autumn.config.ts"],
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: existing pro untouched": 1,
		"has plan: existing growth annual untouched": 1,
		"has plan: credit packs as separate prepaid add-on": 0,
		"modeled exactly 5 plans": 0,
		"base plans carry no prepaid items": 1,
	});
});

test("seed-packs-fork: packs duplicated onto base plans fail the negative anchor", async () => {
	const pollutedGolden = knowledgePlatformGoldenConfig().replace(
		'export const creditsPack = plan({\n\tid: "credits_pack",\n\tname: "Credits Pack",\n\taddOn: true,',
		'export const creditsPack = plan({\n\tid: "credits_pack",\n\tname: "Credits Pack",',
	);
	expect(pollutedGolden).not.toContain("addOn: true");
	const scores = await scoreConfigExpectations({
		axCase: seedPacksFork,
		configFile: pollutedGolden,
	});

	expect(scores["base plans carry no prepaid items"]).toBe(0);
	expect(scores["has plan: credit packs as separate prepaid add-on"]).toBe(0);
});
