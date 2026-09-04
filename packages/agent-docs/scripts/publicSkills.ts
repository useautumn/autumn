import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import {
	dirname,
	isAbsolute,
	join,
	normalize,
	relative,
	resolve,
	sep,
} from "node:path";
import type { Skill } from "../src/translate/formats/types.js";
import { parseFrontmatter } from "../src/translate/ingest/frontmatter.js";

const LOCAL_REFERENCE =
	/read `(?<path>references\/[^`]+)`(?! in the `[^`]+` skill)/gi;
const EXTERNAL_REFERENCE =
	/read `(?<path>references\/[^`]+)` in the `(?<owner>[^`]+)` skill/gi;

const assertRelativeSkillPath = ({
	path,
	skillName,
}: {
	path: string;
	skillName: string;
}) => {
	const normalized = normalize(path);
	if (
		isAbsolute(path) ||
		normalized === ".." ||
		normalized.startsWith(`..${sep}`)
	) {
		throw new Error(`Skill ${skillName} contains unsafe path "${path}"`);
	}
};

const getReferencePaths = ({ skill }: { skill: Skill }) =>
	new Set(skill.references.map((reference) => reference.path));

const readReferenceFiles = ({
	directory,
	rootDirectory = directory,
}: {
	directory: string;
	rootDirectory?: string;
}): Skill["references"] => {
	if (!existsSync(directory)) {
		return [];
	}

	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return readReferenceFiles({ directory: entryPath, rootDirectory });
		}
		return [
			{
				path: relative(rootDirectory, entryPath),
				contents: readFileSync(entryPath, "utf8"),
			},
		];
	});
};

export const validatePublicSkills = ({ skills }: { skills: Skill[] }) => {
	const skillsByName = new Map<string, Skill>();

	for (const skill of skills) {
		if (skillsByName.has(skill.name)) {
			throw new Error(`Duplicate public skill name "${skill.name}"`);
		}
		skillsByName.set(skill.name, skill);

		const { data } = parseFrontmatter({
			path: `${skill.name}/SKILL.md`,
			text: skill.markdown,
		});
		if (!data.name || !data.description) {
			throw new Error(
				`Skill ${skill.name} must include name and description frontmatter`,
			);
		}
		if (data.name !== skill.name) {
			throw new Error(
				`Skill directory "${skill.name}" does not match frontmatter name "${data.name}"`,
			);
		}

		const referencePaths = getReferencePaths({ skill });
		for (const reference of skill.references) {
			assertRelativeSkillPath({ path: reference.path, skillName: skill.name });
			if (!reference.path.startsWith("references/")) {
				throw new Error(
					`Skill ${skill.name} reference "${reference.path}" must live under references/`,
				);
			}
		}

		for (const match of skill.markdown.matchAll(LOCAL_REFERENCE)) {
			const referencePath = match.groups?.path;
			if (referencePath && !referencePaths.has(referencePath)) {
				throw new Error(
					`Skill ${skill.name} points to missing reference "${referencePath}"`,
				);
			}
		}
	}

	for (const skill of skills) {
		for (const match of skill.markdown.matchAll(EXTERNAL_REFERENCE)) {
			const owner = match.groups?.owner;
			const referencePath = match.groups?.path;
			const ownerSkill = owner ? skillsByName.get(owner) : undefined;
			if (
				!ownerSkill ||
				!referencePath ||
				!getReferencePaths({ skill: ownerSkill }).has(referencePath)
			) {
				throw new Error(
					`Skill ${skill.name} points to missing ${owner ?? "unknown"} reference "${referencePath ?? "unknown"}"`,
				);
			}
		}
	}
};

export const writePublicSkills = ({
	outputDirectory,
	skills,
}: {
	outputDirectory: string;
	skills: Skill[];
}) => {
	validatePublicSkills({ skills });
	rmSync(outputDirectory, { force: true, recursive: true });
	mkdirSync(outputDirectory, { recursive: true });

	for (const skill of skills) {
		const skillDirectory = resolve(outputDirectory, skill.name);
		mkdirSync(skillDirectory, { recursive: true });
		writeFileSync(
			join(skillDirectory, "SKILL.md"),
			`${skill.markdown.trim()}\n`,
		);
		for (const reference of skill.references) {
			const outputPath = resolve(skillDirectory, reference.path);
			const relativeOutputPath = relative(skillDirectory, outputPath);
			assertRelativeSkillPath({
				path: relativeOutputPath,
				skillName: skill.name,
			});
			mkdirSync(dirname(outputPath), { recursive: true });
			writeFileSync(outputPath, `${reference.contents.trim()}\n`);
		}
	}
};

export const mirrorPublicSkills = ({
	generatedDirectory,
	sourceCommit,
	targetRepository,
}: {
	generatedDirectory: string;
	sourceCommit: string;
	targetRepository: string;
}) => {
	const targetSkillsDirectory = resolve(targetRepository, "skills");
	rmSync(targetSkillsDirectory, { force: true, recursive: true });
	cpSync(generatedDirectory, targetSkillsDirectory, { recursive: true });
	writeFileSync(
		resolve(targetRepository, "generated-manifest.json"),
		`${JSON.stringify(
			{
				generated_from: "useautumn/autumn",
				source_commit: sourceCommit,
			},
			null,
			2,
		)}\n`,
	);
};

export const validateGeneratedSkillDirectory = ({
	directory,
	expectedSkillNames,
}: {
	directory: string;
	expectedSkillNames: string[];
}) => {
	const actualSkillNames = readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	const expectedNames = [...expectedSkillNames].sort();
	if (JSON.stringify(actualSkillNames) !== JSON.stringify(expectedNames)) {
		throw new Error(
			`Generated public skills do not match config: expected ${expectedNames.join(", ")}, found ${actualSkillNames.join(", ")}`,
		);
	}

	const generatedSkills = expectedSkillNames.map((skillName): Skill => {
		const skillPath = resolve(directory, skillName, "SKILL.md");
		if (!existsSync(skillPath)) {
			throw new Error(`Missing generated public skill ${skillName}`);
		}
		const markdown = readFileSync(skillPath, "utf8");
		const { data } = parseFrontmatter({
			path: skillPath,
			text: markdown,
		});
		if (data.name !== skillName || !data.description) {
			throw new Error(`Invalid generated public skill ${skillName}`);
		}

		return {
			name: skillName,
			description: data.description,
			markdown,
			references: readReferenceFiles({
				directory: resolve(directory, skillName, "references"),
				rootDirectory: resolve(directory, skillName),
			}),
		};
	});

	validatePublicSkills({ skills: generatedSkills });
};
