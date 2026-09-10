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

/** SemVer ordering: numeric core, then prerelease identifiers (a release beats any prerelease). */
const compareVersions = (a: string, b: string): number => {
	const parse = (v: string) => {
		const version = v.split("+", 1)[0] ?? "";
		const dash = version.indexOf("-");
		const core = dash === -1 ? version : version.slice(0, dash);
		const pre = dash === -1 ? null : version.slice(dash + 1).split(".");
		return {
			nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0),
			pre,
		};
	};
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
		if (d !== 0) return d;
	}
	if (x.pre === null && y.pre === null) return 0;
	if (x.pre === null) return 1;
	if (y.pre === null) return -1;
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		const p = x.pre[i];
		const q = y.pre[i];
		if (p === undefined) return -1;
		if (q === undefined) return 1;
		const pn = /^\d+$/.test(p) ? Number(p) : null;
		const qn = /^\d+$/.test(q) ? Number(q) : null;
		if (pn !== null && qn !== null) {
			if (pn !== qn) return pn - qn;
		} else if (pn !== null) return -1;
		else if (qn !== null) return 1;
		else if (p !== q) return p < q ? -1 : 1;
	}
	return 0;
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
