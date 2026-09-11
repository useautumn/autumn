import { describe, expect, test } from "bun:test";
import { type LeafAgentId, leafAgentPrompt, leafSkillsFor } from "./agent.js";

describe("leafSkillsFor", () => {
	test("adds transitive requires after declared skills", () => {
		expect(leafSkillsFor("leaf").map((skill) => skill.name)).toEqual([
			"autumn-billing",
			"autumn-investigate",
			"autumn-concepts",
			"autumn-trials",
			"autumn-schedules",
			"autumn-balances",
		]);
	});

	test("resolves every agent's bundle without duplicates", () => {
		expect(leafSkillsFor("catalog").map((skill) => skill.name)).toEqual([
			"autumn-catalog",
			"autumn-concepts",
		]);
	});
});

describe("leafAgentPrompt", () => {
	const distinctivePhrases: Record<LeafAgentId, string> = {
		catalog: "shared pricing catalog changes",
		leaf: "operates Autumn",
	};

	for (const [id, phrase] of Object.entries(distinctivePhrases)) {
		test(`${id} prompt is non-empty and contains its distinctive phrase`, () => {
			const prompt = leafAgentPrompt(id as LeafAgentId);
			expect(prompt.length).toBeGreaterThan(0);
			expect(prompt).toContain(phrase);
		});
	}

	// The agent's billing and investigation duties live in its skills now, not
	// in the instructions — this guards the split, not the prose.
	test("nothing is routed or handed off any more", () => {
		const prompt = leafAgentPrompt("leaf");
		for (const phrase of [
			"the thread owner and router",
			"fully-packed billing tasks",
			"delegation",
			"specialist",
			"subagent",
		]) {
			expect(prompt).not.toContain(phrase);
		}
	});
});
