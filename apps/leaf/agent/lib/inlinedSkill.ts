import { leafSkills, skillToText } from "@autumn/agent-docs/agent";
import { defineDynamic, defineInstructions } from "eve/instructions";

/** A skill the agent loads on nearly every turn is cheaper inlined: eve serves
 * skill bodies as a `load_skill` tool result, which costs a round-trip and
 * lands in the uncached tail. In the prefix it is cached instead. */
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
