import { leafSkills, skillToText } from "@autumn/agent-docs/agent";
import { defineDynamic, defineSkill } from "eve/skills";

export default defineDynamic({
	events: {
		"session.started": () =>
			Object.fromEntries(
				leafSkills.map((skill) => [
					skill.name,
					defineSkill({
						description: skill.description,
						markdown: skillToText(skill),
					}),
				]),
			),
	},
});
