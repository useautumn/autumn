import { describe, expect, test } from "bun:test";
import { type LeafAgentId, leafAgentPrompt, leafSkillsFor } from "./agent.js";

describe("leafSkillsFor", () => {
	test("adds transitive requires after declared skills", () => {
		expect(leafSkillsFor("billing").map((skill) => skill.name)).toEqual([
			"autumn-billing",
			"autumn-concepts",
		]);
	});

	test("resolves every agent's bundle without duplicates", () => {
		expect(leafSkillsFor("investigator").map((skill) => skill.name)).toEqual([
			"autumn-investigate",
			"autumn-concepts",
		]);
		expect(leafSkillsFor("catalog").map((skill) => skill.name)).toEqual([
			"autumn-catalog",
			"autumn-concepts",
		]);
		expect(leafSkillsFor("orchestrator")).toEqual([]);
	});
});

describe("leafAgentPrompt", () => {
	const distinctivePhrases: Record<LeafAgentId, string> = {
		billing: "fully-packed billing tasks",
		catalog: "shared pricing catalog changes",
		investigator: "getCustomer alone misses entity-scoped plans",
		orchestrator: "the thread owner and router",
	};

	for (const [id, phrase] of Object.entries(distinctivePhrases)) {
		test(`${id} prompt is non-empty and contains its distinctive phrase`, () => {
			const prompt = leafAgentPrompt(id as LeafAgentId);
			expect(prompt.length).toBeGreaterThan(0);
			expect(prompt).toContain(phrase);
		});
	}

	test("routes billing objections separately from causal investigation", () => {
		const prompt = leafAgentPrompt("orchestrator");
		expect(prompt).toContain(
			"ASKING or OBJECTING about current or proposed customer billing",
		);
		expect(prompt).toContain("how or why a customer reached its current state");
		expect(prompt).toContain(
			"A causal, historical, or log question → `investigator`",
		);
		expect(prompt).toContain("billing for a text-only answer");
		expect(prompt).not.toContain(
			"Questions, objections, and stop/explain requests never re-delegate billing",
		);
	});
});
