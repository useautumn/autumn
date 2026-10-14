import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Skill } from "@autumn/agent-docs/skills";
import { PLUGIN_NAME } from "../axConstants.ts";
import { kitUnderTest } from "./kits.ts";
import type { AgentEquipment } from "./types/agentEquipment.ts";
import type { AgentKit } from "./types/agentKit.ts";

const skillId = (skill: string): string => `${PLUGIN_NAME}:${skill}`;

const writePluginManifest = async ({ pluginDir }: { pluginDir: string }) => {
	await mkdir(join(pluginDir, ".claude-plugin"), { recursive: true });
	await writeFile(
		join(pluginDir, ".claude-plugin/plugin.json"),
		JSON.stringify({ name: PLUGIN_NAME, version: "0.0.0" }, null, "\t"),
	);
};

const writeSkillFolder = async ({
	skillsDir,
	skill,
}: {
	skillsDir: string;
	skill: Skill;
}) => {
	const skillDir = join(skillsDir, skill.name);
	await mkdir(skillDir, { recursive: true });
	await writeFile(join(skillDir, "SKILL.md"), skill.markdown);
	for (const reference of skill.references) {
		const referencePath = join(skillDir, reference.path);
		await mkdir(dirname(referencePath), { recursive: true });
		await writeFile(referencePath, reference.contents);
	}
};

export const equipAgent = async ({
	workspaceDir,
	kit,
}: {
	workspaceDir: string;
	kit: AgentKit;
}): Promise<AgentEquipment> => {
	if (kit.skills.length === 0) return {};

	const pluginDir = join(workspaceDir, ".ax-plugin");
	await writePluginManifest({ pluginDir });
	for (const skill of kit.skills) {
		await writeSkillFolder({ skillsDir: join(pluginDir, "skills"), skill });
		await writeSkillFolder({
			skillsDir: join(workspaceDir, ".codex/skills"),
			skill,
		});
	}

	const underTest = kitUnderTest(kit);
	return {
		pluginDir,
		skillIds: kit.skills.map((skill) => skillId(skill.name)),
		underTestSkillId: underTest ? skillId(underTest) : undefined,
	};
};
