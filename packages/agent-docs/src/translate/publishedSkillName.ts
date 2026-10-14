const SKILL_PREFIX = "autumn-";

export const publishedSkillName = ({ name }: { name: string }): string =>
	name.startsWith(SKILL_PREFIX) ? name : `${SKILL_PREFIX}${name}`;
