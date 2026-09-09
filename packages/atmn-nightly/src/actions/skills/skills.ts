import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import chalk from "chalk";
import {
	type BundledSkill,
	SKILLS,
	SKILLS_VERSION,
} from "../../generated/skills";
import { done, hint, same, type WriteLine } from "../../prompt/prompt";

/** The folder under the config where the canonical copies live. */
export const SKILLS_DIR_NAME = "skills";

const FRONTMATTER_VERSION = /^version:\s*(.+)$/m;

const findSkill = ({ name }: { name: string }): BundledSkill => {
	const skill = SKILLS.find((candidate) => candidate.name === name);
	if (skill === undefined)
		throw new Error(
			`No skill named ${JSON.stringify(name)}. Bundled: ${SKILLS.map((candidate) => candidate.name).join(", ")}.`,
		);
	return skill;
};

export const renderSkillsList = (): string => {
	const width = Math.max(...SKILLS.map((skill) => skill.name.length));
	const rows = SKILLS.map(
		(skill) =>
			`${skill.name.padEnd(width)}  ${skill.description}  ${chalk.dim(`(${skill.references.length} refs)`)}`,
	);
	return [
		...rows,
		"",
		`${chalk.dim("atmn skills <name>")}                print a skill`,
		`${chalk.dim("atmn skills <name> --ref <path>")}   print one of its references`,
		`${chalk.dim("atmn skills install [--dir d]")}     write them next to your config`,
		`${chalk.dim("atmn skills update [--dir d]")}      bring an older install up to v${SKILLS_VERSION}`,
	].join("\n");
};

/** Raw to stdout, so `atmn skills catalog | …` is the whole integration. */
export const printSkill = ({
	name,
	ref,
	json = false,
	write,
}: {
	name: string;
	ref?: string;
	json?: boolean;
	write: WriteLine;
}): void => {
	const skill = findSkill({ name });
	if (json) {
		write(`${JSON.stringify(skill, null, 2)}\n`);
		return;
	}
	if (ref !== undefined) {
		const reference = skill.references.find((entry) => entry.path === ref);
		if (reference === undefined)
			throw new Error(
				`${skill.name} has no reference ${JSON.stringify(ref)}. Available: ${skill.references.map((entry) => entry.path).join(", ")}.`,
			);
		write(`${reference.contents}\n`);
		return;
	}
	write(`${skill.markdown}\n`);
};

const writeSkill = ({ dir, skill }: { dir: string; skill: BundledSkill }) => {
	const skillDir = join(dir, skill.name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), skill.markdown, "utf8");
	for (const reference of skill.references) {
		const path = join(skillDir, reference.path);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, reference.contents, "utf8");
	}
};

export const installSkills = ({
	dir,
	write,
}: {
	dir: string;
	write: WriteLine;
}): { written: string[] } => {
	for (const skill of SKILLS) writeSkill({ dir, skill });
	write(
		`${done(`Wrote ${SKILLS.length} skills to ${dir} (v${SKILLS_VERSION})`)}\n`,
	);
	write(`${hint(`npx skills add ${dir} -y`)}      link them into your agent\n`);
	return { written: SKILLS.map((skill) => skill.name) };
};

/** The fan-out to agent folders is `npx skills`' job: it knows the agents, we don't. */
export const linkSkills = async ({
	dir,
	write,
	spawn = (args) =>
		spawnSync(args[0] ?? "npx", args.slice(1), { stdio: "inherit" }).status ??
		1,
}: {
	dir: string;
	write: WriteLine;
	spawn?: (args: string[]) => number;
}): Promise<boolean> => {
	const exitCode = spawn(["npx", "skills", "add", dir, "--all"]);
	if (exitCode === 0) return true;
	write(
		`${hint(`npx skills add ${dir} --all`)} did not complete; run it yourself when you are ready.\n`,
	);
	return false;
};

export type SkillStatus = {
	name: string;
	/** The version the installed SKILL.md states; null when not installed. */
	installed: string | null;
	bundled: string;
};

/** A skill folder may be a symlink into the canonical copy: follow it, so
 * rewriting it updates every agent dir that links there at once. */
const realSkillDir = ({
	dir,
	name,
}: {
	dir: string;
	name: string;
}): string | null => {
	const path = join(dir, name);
	if (!existsSync(path)) return null;
	return lstatSync(path).isSymbolicLink() ? realpathSync(path) : path;
};

const installedVersion = ({
	skillDir,
}: {
	skillDir: string;
}): string | null => {
	const markdownPath = join(skillDir, "SKILL.md");
	if (!existsSync(markdownPath)) return null;
	const match = FRONTMATTER_VERSION.exec(readFileSync(markdownPath, "utf8"));
	return match?.[1]?.trim() ?? "unknown";
};

/** Numeric-first compare of `3.0.0-nightly.2`-style versions; prerelease tags compare after their base. */
const compareVersions = (a: string, b: string): number => {
	const parse = (v: string) => {
		const [base = "", pre] = v.split("-", 2);
		const nums = base.split(".").map((n) => Number.parseInt(n, 10) || 0);
		const preNum =
			pre === undefined
				? null
				: Number.parseInt(pre.replace(/\D+/g, "") || "0", 10);
		return { nums, preNum };
	};
	const x = parse(a),
		y = parse(b);
	for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
		if (d !== 0) return d;
	}
	if (x.preNum === null && y.preNum === null) return 0;
	if (x.preNum === null) return 1;
	if (y.preNum === null) return -1;
	return x.preNum - y.preNum;
};

/** Older than the bundle: the only case update touches. Unknown reads as older. */
const isStale = (installed: string | null): boolean =>
	installed !== null &&
	(installed === "unknown" || compareVersions(installed, SKILLS_VERSION) < 0);

export const skillsStatus = ({ dir }: { dir: string }): SkillStatus[] =>
	SKILLS.map((skill) => {
		const skillDir = realSkillDir({ dir, name: skill.name });
		return {
			name: skill.name,
			installed: skillDir === null ? null : installedVersion({ skillDir }),
			bundled: SKILLS_VERSION,
		};
	});

/** One dim line for push/pull when an installed skill is older than the CLI; null when nothing is. */
export const staleSkillsHint = ({ dir }: { dir: string }): string | null => {
	const stale = skillsStatus({ dir }).filter((entry) =>
		isStale(entry.installed),
	);
	if (stale.length === 0) return null;
	const versions = [...new Set(stale.map((entry) => entry.installed))].join(
		", ",
	);
	return chalk.dim(
		`skills are at v${versions}, the CLI is v${SKILLS_VERSION}: atmn skills update`,
	);
};

export const updateSkills = ({
	dir,
	write,
}: {
	dir: string;
	write: WriteLine;
}): { updated: string[] } => {
	const updated: string[] = [];
	for (const skill of SKILLS) {
		const skillDir = realSkillDir({ dir, name: skill.name });
		const installed = skillDir === null ? null : installedVersion({ skillDir });
		if (installed !== null && !isStale(installed)) {
			write(
				`${same(`${skill.name}  ${installed === SKILLS_VERSION ? "up to date" : `${installed} is newer than this CLI, kept`}`)}\n`,
			);
			continue;
		}
		writeSkill({ dir: skillDir === null ? dir : dirname(skillDir), skill });
		updated.push(skill.name);
		write(
			`${done(`${skill.name}  ${installed === null ? "installed" : `${installed} → ${SKILLS_VERSION}`}`)}\n`,
		);
	}
	return { updated };
};
