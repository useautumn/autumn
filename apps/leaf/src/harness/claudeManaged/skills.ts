import type Anthropic from "@anthropic-ai/sdk";
import { toFile } from "@anthropic-ai/sdk";
import { leafSkills, type Skill } from "@autumn/agent-docs/agent";

/** A custom-skill attachment ref. `version: "latest"` means the agent always uses
 * the newest uploaded version, so content updates don't require re-attaching. */
export type LeafSkillRef = {
	type: "custom";
	skill_id: string;
	version: "latest";
};

// Skill files must share one top-level directory (its name) and include SKILL.md.
const skillFiles = (skill: Skill) =>
	Promise.all([
		toFile(Buffer.from(skill.markdown), `${skill.name}/SKILL.md`),
		...skill.references.map((reference) =>
			toFile(
				Buffer.from(reference.contents),
				`${skill.name}/${reference.path}`,
			),
		),
	]);

const findSkillIdByTitle = async (client: Anthropic, title: string) => {
	for await (const skill of client.beta.skills.list()) {
		if (skill.display_title === title) return skill.id;
	}
	return undefined;
};

let skillRefsPromise: Promise<LeafSkillRef[]> | undefined;

/**
 * Upload Leaf's knowledge skills to the Anthropic workspace and return refs to
 * attach to the managed agent. Memoized per process: each start uploads a fresh
 * version of every skill (so edits propagate via `version: "latest"`) without
 * re-uploading per turn.
 */
export const ensureLeafSkills = async (
	client: Anthropic,
): Promise<LeafSkillRef[]> => {
	skillRefsPromise ??= (async () => {
		const refs: LeafSkillRef[] = [];
		for (const skill of leafSkills) {
			const files = await skillFiles(skill);
			const existingId = await findSkillIdByTitle(client, skill.name);
			let skillId: string;
			if (existingId) {
				await client.beta.skills.versions.create(existingId, { files });
				skillId = existingId;
			} else {
				const created = await client.beta.skills.create({
					display_title: skill.name,
					files,
				});
				skillId = created.id;
			}
			refs.push({ type: "custom", skill_id: skillId, version: "latest" });
		}
		return refs;
	})().catch((error) => {
		// Don't cache a failed sync — let the next call retry.
		skillRefsPromise = undefined;
		throw error;
	});
	return skillRefsPromise;
};

/** True when the agent already has exactly the desired skill set attached. */
export const skillsMatch = (
	current: ReadonlyArray<{ skill_id?: string | null }> | undefined,
	desired: LeafSkillRef[],
): boolean => {
	const currentIds = new Set(
		(current ?? [])
			.map((skill) => skill.skill_id)
			.filter((id): id is string => Boolean(id)),
	);
	return (
		desired.length === currentIds.size &&
		desired.every((ref) => currentIds.has(ref.skill_id))
	);
};
