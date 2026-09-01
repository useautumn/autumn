/**
 * Grader proofs for the discovery case: the golden config passes every
 * catalog verdict; an empty workspace fails them all.
 */
import { expect, test } from "bun:test";
import { proAndGrowthDiscovery } from "../../cases/flow/proAndGrowthDiscovery.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("pro-and-growth-discovery: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: proAndGrowthDiscovery,
		configFile: proAndGrowthDiscovery.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro 500 messages": 1,
		"has plan: growth 2000 messages": 1,
		"has feature: ai messages (metered)": 1,
	});
});

test("pro-and-growth-discovery: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: proAndGrowthDiscovery,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: pro 500 messages": 0,
		"has plan: growth 2000 messages": 0,
		"has feature: ai messages (metered)": 0,
	});
});
