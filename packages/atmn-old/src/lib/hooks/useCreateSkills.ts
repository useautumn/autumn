import fs from "node:fs/promises";
import path from "node:path";
import { useState } from "react";
import { type Skill, skills } from "../../prompts/skills/index.js";

type CreateSkillsState = "idle" | "creating" | "done" | "error";

export type SkillsLocation = ".claude/skills" | ".agents/skills" | "custom";

export interface UseCreateSkillsResult {
	create: (
		targetDir: string,
		options?: { saveAll?: boolean; hasPricing?: boolean },
	) => Promise<void>;
	state: CreateSkillsState;
	filesCreated: string[];
	error: string | null;
	skillsDir: string;
}

/**
 * Hook to create AI skill files in the SKILLS standard format.
 * Skills are saved as SKILL.md files in subdirectories:
 *
 * <targetDir>/
 *   autumn-setup/SKILL.md
 *   autumn-gating/SKILL.md
 *   autumn-billing-page/SKILL.md
 *   autumn-modelling-pricing-plans/SKILL.md
 */
export function useCreateSkills(): UseCreateSkillsResult {
	const [state, setState] = useState<CreateSkillsState>("idle");
	const [filesCreated, setFilesCreated] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [skillsDir, setSkillsDir] = useState<string>("");

	const create = async (
		targetDir: string,
		options?: { saveAll?: boolean; hasPricing?: boolean },
	) => {
		setState("creating");
		setSkillsDir(targetDir);

		try {
			const cwd = process.cwd();
			const skillsPath = path.join(cwd, targetDir);

			const created: string[] = [];

			// Filter skills based on options
			const skillsToCreate = skills.filter((skill) => {
				// Skip pricing skill if user already has pricing (unless saveAll is true)
				if (
					skill.id === "autumn-pricing" &&
					!options?.saveAll &&
					options?.hasPricing
				) {
					return false;
				}
				return true;
			});

			// Create each skill in its own subdirectory
			for (const skill of skillsToCreate) {
				const skillDir = path.join(skillsPath, skill.id);
				await fs.mkdir(skillDir, { recursive: true });

				const skillFilePath = path.join(skillDir, "SKILL.md");
				await fs.writeFile(skillFilePath, skill.content, "utf-8");

				created.push(`${skill.id}/SKILL.md`);
			}

			setFilesCreated(created);
			setState("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create skills");
			setState("error");
		}
	};

	return { create, state, filesCreated, error, skillsDir };
}
