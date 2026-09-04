import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Skill } from "../src/translate/formats/types.js";
import {
	mirrorPublicSkills,
	validatePublicSkills,
	writePublicSkills,
} from "./publicSkills.js";

const createSkill = ({
	name = "autumn-test",
	markdown,
	references = [],
}: {
	name?: string;
	markdown?: string;
	references?: Skill["references"];
} = {}): Skill => ({
	name,
	description: "Test skill",
	markdown:
		markdown ??
		`---\nname: ${name}\ndescription: Test skill\n---\n\n# Test skill`,
	references,
});

describe("public skill validation", () => {
	test("rejects duplicate names", () => {
		expect(() =>
			validatePublicSkills({
				skills: [createSkill(), createSkill()],
			}),
		).toThrow('Duplicate public skill name "autumn-test"');
	});

	test("rejects a missing local reference", () => {
		expect(() =>
			validatePublicSkills({
				skills: [
					createSkill({
						markdown:
							"---\nname: autumn-test\ndescription: Test\n---\n\nRead `references/missing.md`.",
					}),
				],
			}),
		).toThrow('points to missing reference "references/missing.md"');
	});

	test("rejects mismatched frontmatter names", () => {
		expect(() =>
			validatePublicSkills({
				skills: [
					createSkill({
						markdown:
							"---\nname: autumn-other\ndescription: Test\n---\n\n# Test",
					}),
				],
			}),
		).toThrow("does not match frontmatter name");
	});
});

describe("public skill output", () => {
	test("removes stale generated skills before writing", () => {
		const directory = mkdtempSync(resolve(tmpdir(), "autumn-skills-"));
		const stalePath = resolve(directory, "autumn-stale", "SKILL.md");
		mkdirSync(resolve(stalePath, ".."), { recursive: true });
		writeFileSync(stalePath, "stale");

		writePublicSkills({ outputDirectory: directory, skills: [createSkill()] });

		expect(() => readFileSync(stalePath, "utf8")).toThrow();
		expect(
			readFileSync(resolve(directory, "autumn-test", "SKILL.md"), "utf8"),
		).toContain("name: autumn-test");
	});

	test("mirrors only the generated skills directory", () => {
		const generatedDirectory = mkdtempSync(
			resolve(tmpdir(), "autumn-generated-skills-"),
		);
		const targetRepository = mkdtempSync(
			resolve(tmpdir(), "autumn-skills-repository-"),
		);
		writePublicSkills({
			outputDirectory: generatedDirectory,
			skills: [createSkill()],
		});
		writeFileSync(resolve(targetRepository, "README.md"), "keep me");
		mkdirSync(resolve(targetRepository, "skills", "autumn-old"), {
			recursive: true,
		});
		writeFileSync(
			resolve(targetRepository, "skills", "autumn-old", "SKILL.md"),
			"remove me",
		);

		mirrorPublicSkills({
			generatedDirectory,
			sourceCommit: "abc123",
			targetRepository,
		});

		expect(readFileSync(resolve(targetRepository, "README.md"), "utf8")).toBe(
			"keep me",
		);
		expect(() =>
			readFileSync(
				resolve(targetRepository, "skills", "autumn-old", "SKILL.md"),
				"utf8",
			),
		).toThrow();
		expect(
			readFileSync(
				resolve(targetRepository, "generated-manifest.json"),
				"utf8",
			),
		).toContain('"source_commit": "abc123"');
	});
});
