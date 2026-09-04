import type { SkillFile } from "./formats/types.js";
import { parseFrontmatter } from "./ingest/frontmatter.js";
import { publishedSkillName } from "./publishedSkillName.js";

// Inline a docs page into the SKILL.md body.
const DOCS_TAG = /<docs\s+([^>]*?)\/>/g;
// Split a docs page into references/<slug>.md, leaving a pointer in the body.
const REFERENCE_TAG = /<reference\s+([^>]*?)\/>/g;
// Split a sibling content file into references/<slug>.md, leaving a pointer.
const PART_TAG = /<part\s+([^>]*?)\/>/g;
// Point at another skill's reference file WITHOUT copying it — the target is
// resolved at generate time so deleting/moving it breaks the build.
const POINTER_TAG = /<pointer\s+([^>]*?)\/>/g;
// Point at a prerequisite skill the agent should load first.
const SKILL_TAG = /<skill\s+([^>]*?)\/>/g;
const ATTR = /(\w+)="([^"]*)"/g;

export type ComposedSkill = {
	name: string;
	description: string;
	body: string;
	references: SkillFile[];
	requires: string[];
};

const parseAttrs = (raw: string): Record<string, string> => {
	const attrs: Record<string, string> = {};
	for (const match of raw.matchAll(ATTR)) {
		attrs[match[1] as string] = match[2] as string;
	}
	return attrs;
};

const slugFromUrl = (url: string): string => {
	const [path, anchor] = url.split("#");
	const page = path?.replace(/^\//, "").split("/").pop();
	if (!page) {
		throw new Error(`Cannot derive a reference name from url "${url}"`);
	}
	return anchor ? `${page}-${anchor}` : page;
};

/**
 * Compose a skill from its mdx: read the frontmatter (name/description) and
 * resolve insertion tags. `<docs url="…" />` inlines a translated docs page;
 * `<reference url="…" when="…" />` splits it into a `references/<slug>.md` file
 * (progressive disclosure) and leaves a pointer in the body. `resolveDocs` is
 * injected so this stays filesystem-free.
 */
export const composeSkill = ({
	path,
	text,
	resolveDocs,
	resolveContentFile,
}: {
	path: string;
	text: string;
	resolveDocs: (url: string) => string;
	resolveContentFile: (file: string) => string;
}): ComposedSkill => {
	const { data, body } = parseFrontmatter({ path, text });
	if (!data.name) {
		throw new Error(`Skill ${path} is missing frontmatter name`);
	}
	if (!data.description) {
		throw new Error(`Skill ${path} is missing frontmatter description`);
	}

	const references: SkillFile[] = [];
	const requires: string[] = [];

	// MDX comments are authoring-only; strip first so commented-out tags never execute.
	const withoutComments = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

	const withSkillRefs = withoutComments.replace(
		SKILL_TAG,
		(_match, raw: string) => {
			const { name, reason, text } = parseAttrs(raw);
			if (!name) {
				throw new Error(`<skill> in ${path} is missing a name`);
			}
			const published = publishedSkillName({ name });
			if (!requires.includes(published)) {
				requires.push(published);
			}
			// `text` renders verbatim, for prose that already names the prerequisite.
			if (text) {
				return text;
			}
			return reason
				? `Before using this skill, first load the \`${published}\` skill — ${reason}.`
				: `Before using this skill, first load the \`${published}\` skill.`;
		},
	);

	const withReferences = withSkillRefs.replace(
		REFERENCE_TAG,
		(_match, raw: string) => {
			const { url, when } = parseAttrs(raw);
			if (!url) {
				throw new Error(`<reference> in ${path} is missing a url`);
			}
			if (!when) {
				throw new Error(
					`<reference url="${url}"> in ${path} is missing "when"`,
				);
			}
			const referencePath = `references/${slugFromUrl(url)}.md`;
			references.push({
				path: referencePath,
				contents: resolveDocs(url).trim(),
			});
			return `For ${when}, read \`${referencePath}\`.`;
		},
	);

	const withPointers = withReferences.replace(
		POINTER_TAG,
		(_match, raw: string) => {
			const { file, when } = parseAttrs(raw);
			if (!file) {
				throw new Error(`<pointer> in ${path} is missing a file`);
			}
			if (!when) {
				throw new Error(`<pointer file="${file}"> in ${path} is missing "when"`);
			}
			// Validation only — a deleted or moved target fails the build here.
			resolveContentFile(file);
			const owner = /\.\.\/([\w-]+)\//.exec(file)?.[1];
			const slug = file.split("/").pop()?.replace(/\.[^.]+$/, "");
			if (!owner || !slug) {
				throw new Error(
					`<pointer file="${file}"> in ${path} must point into a sibling skill (../<skill>/…)`,
				);
			}
			const ownerSkill = publishedSkillName({ name: owner });
			return `For ${when}, read \`references/${slug}.md\` in the \`${ownerSkill}\` skill.`;
		},
	);

	const withParts = withPointers.replace(PART_TAG, (_match, raw: string) => {
		const { file, when, inline } = parseAttrs(raw);
		if (!file) {
			throw new Error(`<part> in ${path} is missing a file`);
		}
		const contents = resolveContentFile(file).trim();
		// `inline="true"` keeps the part top-level in SKILL.md (always loaded)
		// instead of splitting it into a progressively-disclosed references/ file.
		if (inline === "true") {
			return contents;
		}
		if (!when) {
			throw new Error(`<part file="${file}"> in ${path} is missing "when"`);
		}
		// Output is always references/<basename>.md, so the source file may live
		// alongside the skill or under its own references/ folder.
		const slug = file
			.split("/")
			.pop()
			?.replace(/\.[^.]+$/, "");
		const referencePath = `references/${slug}.md`;
		references.push({ path: referencePath, contents });
		return `For ${when}, read \`${referencePath}\`.`;
	});

	const resolved = withParts
		.replace(DOCS_TAG, (_match, raw: string) => {
			const { url } = parseAttrs(raw);
			if (!url) {
				throw new Error(`<docs> in ${path} is missing a url`);
			}
			return resolveDocs(url).trim();
		})
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return {
		name: publishedSkillName({ name: data.name }),
		description: data.description,
		body: resolved,
		references,
		requires,
	};
};
