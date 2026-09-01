/**
 * Grader proofs for the messaging-API suite: each case's golden config must
 * score 1 on every config expectation, an empty workspace 0.
 */
import { expect, test } from "bun:test";
import { discovery } from "../../cases/suites/messagingApi/discovery.eval.ts";
import { plansThenAddOns } from "../../cases/suites/messagingApi/plansThenAddOns.eval.ts";
import { wholePricingOneShot } from "../../cases/suites/messagingApi/wholePricingOneShot.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("whole-pricing-one-shot: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: wholePricingOneShot,
		configFile: wholePricingOneShot.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 6 plans": 1,
		"has plan: free 3k messages": 1,
		"has plan: pro 50k + per-1k overage": 1,
		"has plan: scale 150k messages": 1,
		"has plan: sso flat add-on": 1,
		"has plan: prepaid gateway add-on": 1,
		"has plan: workflows graduated to inf": 1,
		"has feature: messages (metered)": 1,
	});
});

test("whole-pricing-one-shot: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: wholePricingOneShot });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"modeled exactly 6 plans": 0,
		"has plan: free 3k messages": 0,
		"has plan: pro 50k + per-1k overage": 0,
		"has plan: scale 150k messages": 0,
		"has plan: sso flat add-on": 0,
		"has plan: prepaid gateway add-on": 0,
		"has plan: workflows graduated to inf": 0,
		"has feature: messages (metered)": 0,
	});
});

test("plans-then-add-ons: golden config passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: plansThenAddOns,
		configFile: plansThenAddOns.goldenConfig,
	});

	expect(scores).toEqual({
		"after turn 1: config parses and passes validation": 1,
		"after turn 1: has plan: free 3k messages": 1,
		"after turn 1: has plan: pro 50k + per-1k overage": 1,
		"config parses and passes validation": 1,
		"modeled exactly 6 plans": 1,
		"has plan: free 3k messages": 1,
		"has plan: pro 50k + per-1k overage": 1,
		"has plan: scale 150k messages": 1,
		"has plan: sso flat add-on": 1,
		"has plan: prepaid gateway add-on": 1,
		"has plan: workflows graduated to inf": 1,
		"has feature: messages (metered)": 1,
	});
});

test("plans-then-add-ons: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: plansThenAddOns });

	expect(scores).toEqual({
		"after turn 1: config parses and passes validation": 0,
		"after turn 1: has plan: free 3k messages": 0,
		"after turn 1: has plan: pro 50k + per-1k overage": 0,
		"config parses and passes validation": 0,
		"modeled exactly 6 plans": 0,
		"has plan: free 3k messages": 0,
		"has plan: pro 50k + per-1k overage": 0,
		"has plan: scale 150k messages": 0,
		"has plan: sso flat add-on": 0,
		"has plan: prepaid gateway add-on": 0,
		"has plan: workflows graduated to inf": 0,
		"has feature: messages (metered)": 0,
	});
});

test("discovery: base-plans golden passes every config expectation", async () => {
	const scores = await scoreConfigExpectations({
		axCase: discovery,
		configFile: discovery.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 3 plans": 1,
		"has plan: free 3k messages": 1,
		"has plan: pro 50k + per-1k overage": 1,
		"has plan: scale 150k messages": 1,
		"has feature: messages (metered)": 1,
	});
});

test("discovery: empty workspace fails every config expectation", async () => {
	const scores = await scoreConfigExpectations({ axCase: discovery });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"modeled exactly 3 plans": 0,
		"has plan: free 3k messages": 0,
		"has plan: pro 50k + per-1k overage": 0,
		"has plan: scale 150k messages": 0,
		"has feature: messages (metered)": 0,
	});
});
