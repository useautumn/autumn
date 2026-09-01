/**
 * Grader proofs for the knowledge-platform suite: each case's golden config
 * must score 1 on every config expectation (checkpoints included — the full
 * golden subset-matches every turn), and an empty workspace must score 0.
 */
import { expect, test } from "bun:test";
import { creditsAddOnTiers } from "../../cases/suites/knowledgePlatform/creditsAddOnTiers.eval.ts";
import { plansThenCredits } from "../../cases/suites/knowledgePlatform/plansThenCredits.eval.ts";
import { wholePricingOneShot } from "../../cases/suites/knowledgePlatform/wholePricingOneShot.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("plans-then-credits: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: plansThenCredits,
		configFile: plansThenCredits.goldenConfig,
	});

	expect(scores).toEqual({
		"after turn 1: config parses and passes validation": 1,
		"after turn 1: has plan: pro monthly": 1,
		"after turn 1: has plan: growth annual": 1,
		"config parses and passes validation": 1,
		"has plan: pro monthly": 1,
		"has plan: growth annual": 1,
		"has plan: credits add-on prepaid packages": 1,
		"has plan: overage priced somewhere": 1,
		"has feature: ai credits (metered)": 1,
		"modeled exactly 5 plans": 1,
	});
});

test("plans-then-credits: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: plansThenCredits });

	expect(scores).toEqual({
		"after turn 1: config parses and passes validation": 0,
		"after turn 1: has plan: pro monthly": 0,
		"after turn 1: has plan: growth annual": 0,
		"config parses and passes validation": 0,
		"has plan: pro monthly": 0,
		"has plan: growth annual": 0,
		"has plan: credits add-on prepaid packages": 0,
		"has plan: overage priced somewhere": 0,
		"has feature: ai credits (metered)": 0,
		"modeled exactly 5 plans": 0,
	});
});

test("whole-pricing-one-shot: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: wholePricingOneShot,
		configFile: wholePricingOneShot.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro monthly": 1,
		"has plan: growth annual": 1,
		"has plan: credits add-on prepaid packages": 1,
		"has plan: overage priced somewhere": 1,
		"has feature: ai credits (metered)": 1,
		"modeled exactly 5 plans": 1,
	});
});

test("whole-pricing-one-shot: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: wholePricingOneShot });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: pro monthly": 0,
		"has plan: growth annual": 0,
		"has plan: credits add-on prepaid packages": 0,
		"has plan: overage priced somewhere": 0,
		"has feature: ai credits (metered)": 0,
		"modeled exactly 5 plans": 0,
	});
});

test("credits-add-on-tiers: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: creditsAddOnTiers,
		configFile: creditsAddOnTiers.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: existing pro untouched": 1,
		"has plan: existing growth annual untouched": 1,
		"has plan: credits add-on prepaid packages": 1,
		"has plan: overage priced somewhere": 1,
		"has feature: ai credits (metered)": 1,
		"modeled exactly 5 plans": 1,
	});
});

test("credits-add-on-tiers: the seeded base config alone fails the add-on expectations", async () => {
	const scores = await scoreConfigExpectations({
		axCase: creditsAddOnTiers,
		configFile: creditsAddOnTiers.existingFiles?.["autumn.config.ts"],
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: existing pro untouched": 1,
		"has plan: existing growth annual untouched": 1,
		"has plan: credits add-on prepaid packages": 0,
		"has plan: overage priced somewhere": 0,
		"has feature: ai credits (metered)": 1,
		"modeled exactly 5 plans": 0,
	});
});
