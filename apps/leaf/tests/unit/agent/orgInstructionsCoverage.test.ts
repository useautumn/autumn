import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const agentRoot = join(import.meta.dir, "../../../agent");

const subagentDirs = () => {
	const root = join(agentRoot, "subagents");
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true }).filter((entry) =>
		entry.isDirectory(),
	);
};

describe("agent instruction module coverage", () => {
	// Without this module the agent runs with none of the org's standing rules.
	test("the agent renders org instructions", () => {
		expect(existsSync(join(agentRoot, "instructions/org.ts"))).toBe(true);
	});

	// The billing playbook reaches the agent only by being inlined here; losing
	// this module drops it silently rather than failing loudly.
	test("the agent inlines the billing skill", () => {
		expect(existsSync(join(agentRoot, "instructions/billingSkill.ts"))).toBe(
			true,
		);
	});

	test("any subagent reintroduced also renders org instructions", () => {
		for (const subagent of subagentDirs()) {
			expect(
				existsSync(
					join(agentRoot, "subagents", subagent.name, "instructions/org.ts"),
				),
			).toBe(true);
		}
	});
});
