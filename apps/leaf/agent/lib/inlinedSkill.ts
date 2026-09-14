import { leafSkills, type Skill, skillToText } from "@autumn/agent-docs/agent";
import { defineDynamic, defineInstructions } from "eve/instructions";

/** The skill to inline, or a thrown error: a misspelled or renamed skill must
 * fail the agent build, never quietly leave the prompt without it. (The
 * `billing` → `autumn-billing` rename did exactly that on 2026-09-02.) */
export const resolveInlinedSkill = ({ name }: { name: string }): Skill => {
	const skill = leafSkills.find((entry) => entry.name === name);
	if (!skill) {
		const known = leafSkills.map((entry) => entry.name).join(", ");
		throw new Error(
			`Cannot inline unknown leaf skill "${name}". Known skills: ${known}`,
		);
	}
	return skill;
};

/** An every-turn skill is cheaper inlined: a `load_skill` result lands in the
 * uncached tail, the prompt prefix is cached. */
export const inlinedSkill = ({ name }: { name: string }) => {
	const markdown = skillToText(resolveInlinedSkill({ name }));
	return defineDynamic({
		events: {
			"session.started": () => defineInstructions({ markdown }),
		},
	});
};
