import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const agentRoot = join(import.meta.dir, "../../../agent");

// Org policy rides the session auth to every child; a subagent without the
// org instruction module silently executes without the org's standing rules.
describe("org instructions coverage", () => {
	test("the root agent renders org instructions", () => {
		expect(existsSync(join(agentRoot, "instructions/org.ts"))).toBe(true);
	});

	test("every subagent renders org instructions", () => {
		const subagents = readdirSync(join(agentRoot, "subagents"), {
			withFileTypes: true,
		}).filter((entry) => entry.isDirectory());
		expect(subagents.length).toBeGreaterThan(0);
		for (const subagent of subagents) {
			expect(
				existsSync(
					join(agentRoot, "subagents", subagent.name, "instructions/org.ts"),
				),
			).toBe(true);
		}
	});
});
