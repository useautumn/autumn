/**
 * The billing skill is inlined into leaf's prompt on every turn. On 2026-09-02
 * the skill was renamed `billing` → `autumn-billing` and the inline lookup
 * silently returned nothing for twelve days: the "use add_items/remove_items,
 * never replace `items`" rule was only in context when the model chose to
 * load the skill, and on 2026-09-14 a Slack attach wiped a plan's items.
 * These tests pin the inline to a real skill and make a bad name throw.
 */

import { describe, expect, test } from "bun:test";

const { loadableSkills } = await import("../../../agent/lib/agentSkills.js");
const { resolveInlinedSkill } = await import(
	"../../../agent/lib/inlinedSkill.js"
);

const INLINED_BILLING_SKILL = "autumn-billing";

describe("inlined billing skill", () => {
	test("resolves to the billing skill with its customize rules", () => {
		const skill = resolveInlinedSkill({ name: INLINED_BILLING_SKILL });
		expect(skill.name).toBe(INLINED_BILLING_SKILL);
		expect(skill.markdown).toContain("Do not replace the whole `items` array");
	});

	test("throws for a skill name that does not exist", () => {
		expect(() => resolveInlinedSkill({ name: "billing" })).toThrow(
			/Cannot inline unknown leaf skill "billing"/,
		);
	});
});

describe("loadable skill bundle", () => {
	test("offers every leaf skill except the inlined one", () => {
		const names = loadableSkills({
			agent: "leaf",
			inlined: [INLINED_BILLING_SKILL],
		}).map((skill) => skill.name);
		expect(names).not.toContain(INLINED_BILLING_SKILL);
		expect(names).toContain("autumn-concepts");
	});

	test("throws when an inlined name is not in the bundle", () => {
		expect(() =>
			loadableSkills({ agent: "leaf", inlined: ["billing"] }),
		).toThrow(/Inlined skill "billing" is not in the "leaf" bundle/);
	});
});
