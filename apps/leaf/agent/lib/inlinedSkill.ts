import { leafSkills, skillToText } from "@autumn/agent-docs/agent";
import { defineDynamic, defineInstructions } from "eve/instructions";

/** An every-turn skill is cheaper inlined: a `load_skill` result lands in the
 * uncached tail, the prompt prefix is cached. */
export const inlinedSkill = ({ name }: { name: string }) =>
	defineDynamic({
		events: {
			"session.started": () => {
				const skill = leafSkills.find((entry) => entry.name === name);
				if (!skill) return null;
				return defineInstructions({ markdown: skillToText(skill) });
			},
		},
	});
