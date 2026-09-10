const SKILL_PREFIX = "autumn-";

/** Published skill id: `setup` → `autumn-setup`. Already-prefixed names stay as-is. */
export const publishedSkillName = ({ name }: { name: string }): string =>
	name.startsWith(SKILL_PREFIX) ? name : `${SKILL_PREFIX}${name}`;
