/**
 * `atmn skills`: the CLI carries its own skills, frozen at its version.
 *
 * Contract:
 *   - skills                 lists name, description, reference count, and the subcommands
 *   - skills <name>          prints the raw SKILL.md, nothing else
 *   - skills <name> --ref p  prints one reference file
 *   - skills <name> --json   { name, description, version, markdown, references[] }
 *   - skills install         writes <dir>/<name>/SKILL.md + references, prints the npx hint
 *   - skills update          rewrites folders whose frontmatter version is older; `=` for current
 *   - skillsStatus           reports installed vs bundled version (the stale hint push/pull print)
 */

import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import {
	installSkills,
	printSkill,
	renderSkillsList,
	skillsStatus,
	staleSkillsHint,
	updateSkills,
} from "../src/actions/skills/skills";
import { SKILLS, SKILLS_VERSION } from "../src/generated/skills";

chalk.level = 0;

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
const tmp = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-skills-"));
	dirs.push(dir);
	return dir;
};

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

const first = SKILLS[0];
if (first === undefined) throw new Error("the CLI bundles no skills");

test("the list names every bundled skill with its reference count and the subcommands", () => {
	const text = renderSkillsList();
	for (const skill of SKILLS) {
		expect(text).toContain(skill.name);
		expect(text).toContain(`${skill.references.length} ref`);
	}
	expect(text).toContain("atmn skills <name>");
	expect(text).toContain("atmn skills install");
});

test("printing a skill writes the SKILL.md verbatim, frontmatter and version included", () => {
	const { lines, write } = capture();
	printSkill({ name: first.name, write });
	expect(lines.join("")).toBe(`${first.markdown}\n`);
	expect(first.markdown).toContain(`version: ${SKILLS_VERSION}`);
});

test("--ref prints one reference; an unknown one names the available paths", () => {
	const reference = first.references[0];
	if (reference === undefined) throw new Error("first skill has no references");
	const { lines, write } = capture();
	printSkill({ name: first.name, ref: reference.path, write });
	expect(lines.join("")).toBe(`${reference.contents}\n`);

	expect(() =>
		printSkill({ name: first.name, ref: "references/nope.md", write }),
	).toThrow(new RegExp(reference.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("--json carries the whole skill", () => {
	const { lines, write } = capture();
	printSkill({ name: first.name, json: true, write });
	const parsed = JSON.parse(lines.join(""));
	expect(parsed.name).toBe(first.name);
	expect(parsed.version).toBe(SKILLS_VERSION);
	expect(parsed.markdown).toBe(first.markdown);
	expect(parsed.references.length).toBe(first.references.length);
});

test("an unknown skill lists the ones that exist", () => {
	expect(() => printSkill({ name: "nope", write: () => {} })).toThrow(
		new RegExp(first.name),
	);
});

test("install writes every skill folder and prints the npx hint", () => {
	const dir = tmp();
	const { lines, write } = capture();
	const result = installSkills({ dir, write });

	for (const skill of SKILLS) {
		const markdown = readFileSync(join(dir, skill.name, "SKILL.md"), "utf8");
		expect(markdown).toBe(skill.markdown);
		for (const reference of skill.references)
			expect(readFileSync(join(dir, skill.name, reference.path), "utf8")).toBe(
				reference.contents,
			);
	}
	expect(result.written).toEqual(SKILLS.map((skill) => skill.name));
	const text = lines.join("");
	expect(text).toContain(
		`✓ Wrote ${SKILLS.length} skills to ${dir} (v${SKILLS_VERSION})`,
	);
	expect(text).toContain(`npx skills add ${dir} -y`);
});

test("status tells installed from missing from stale, and update rewrites only the stale", () => {
	const dir = tmp();
	installSkills({ dir, write: () => {} });
	const stalePath = join(dir, first.name, "SKILL.md");
	writeFileSync(
		stalePath,
		first.markdown.replace(`version: ${SKILLS_VERSION}`, "version: 0.0.1"),
	);
	const empty = tmp();

	expect(skillsStatus({ dir: empty })).toEqual(
		SKILLS.map((skill) => ({
			name: skill.name,
			installed: null,
			bundled: SKILLS_VERSION,
		})),
	);
	const status = skillsStatus({ dir });
	expect(status.find((entry) => entry.name === first.name)?.installed).toBe(
		"0.0.1",
	);
	expect(staleSkillsHint({ dir })).toContain("atmn skills update");
	expect(staleSkillsHint({ dir: empty })).toBeNull();

	const { lines, write } = capture();
	const updated = updateSkills({ dir, write });
	expect(updated.updated).toEqual([first.name]);
	expect(readFileSync(stalePath, "utf8")).toBe(first.markdown);
	const text = lines.join("");
	expect(text).toContain(`✓ ${first.name}`);
	expect(text).toContain(`0.0.1 → ${SKILLS_VERSION}`);
	for (const skill of SKILLS.slice(1))
		expect(text).toContain(`= ${skill.name}`);
	expect(staleSkillsHint({ dir })).toBeNull();
});

test("a newer install is never downgraded, and the stale hint stays quiet for it", () => {
	const dir = tmp();
	installSkills({ dir, write: () => {} });
	const path = join(dir, first.name, "SKILL.md");
	const newer = first.markdown.replace(
		`version: ${SKILLS_VERSION}`,
		"version: 99.0.0",
	);
	writeFileSync(path, newer);

	expect(staleSkillsHint({ dir })).toBeNull();
	const { lines, write } = capture();
	const { updated } = updateSkills({ dir, write });
	expect(updated).toEqual([]);
	expect(readFileSync(path, "utf8")).toBe(newer);
	expect(lines.join("")).toContain("newer than this CLI, kept");

	// Prerelease identifiers order like semver: rc beats nightly, a release beats both.
	for (const version of [
		"3.0.0-rc.1",
		"3.0.0-rc-2.1",
		"3.0.0",
		"3.0.1-nightly.1",
	]) {
		writeFileSync(
			path,
			first.markdown.replace(
				`version: ${SKILLS_VERSION}`,
				`version: ${version}`,
			),
		);
		expect(updateSkills({ dir, write: () => {} }).updated).toEqual([]);
	}
	writeFileSync(
		path,
		first.markdown.replace(
			`version: ${SKILLS_VERSION}`,
			"version: 3.0.0-nightly.1",
		),
	);
	expect(updateSkills({ dir, write: () => {} }).updated).toEqual([first.name]);
});

test("update follows a symlinked skill folder back to the canonical copy", () => {
	const canonical = tmp();
	installSkills({ dir: canonical, write: () => {} });
	const agentDir = tmp();
	const { symlinkSync } = require("node:fs") as typeof import("node:fs");
	symlinkSync(join(canonical, first.name), join(agentDir, first.name));
	writeFileSync(
		join(canonical, first.name, "SKILL.md"),
		first.markdown.replace(`version: ${SKILLS_VERSION}`, "version: 0.0.1"),
	);

	const status = skillsStatus({ dir: agentDir });
	expect(status.find((entry) => entry.name === first.name)?.installed).toBe(
		"0.0.1",
	);
	updateSkills({ dir: agentDir, write: () => {} });
	expect(readFileSync(join(canonical, first.name, "SKILL.md"), "utf8")).toBe(
		first.markdown,
	);
	expect(existsSync(join(agentDir, first.name, "SKILL.md"))).toBe(true);
});
