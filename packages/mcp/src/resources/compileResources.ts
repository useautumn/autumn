import { readFileSync } from "node:fs";
import type { AutumnMcpResourceDoc, ResourceFrontmatter } from "./types.js";

const DEFAULT_PRIORITY = 0.8;
const DEFAULT_AUDIENCE = ["assistant"] as const;

const parseScalar = (value: string): string | number => {
	const trimmed = value.trim();
	const unquoted = trimmed.match(/^['"](.*)['"]$/);
	if (unquoted) return unquoted[1] ?? "";

	const number = Number(trimmed);
	if (trimmed && Number.isFinite(number)) return number;

	return trimmed;
};

export const parseResourceMarkdown = ({
	path,
	text,
}: {
	path: string;
	text: string;
}): ResourceFrontmatter & { body: string } => {
	const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		throw new Error(`MCP resource ${path} is missing frontmatter`);
	}

	const frontmatter = match[1] ?? "";
	const body = (match[2] ?? "").trim();
	const values: Record<string, unknown> = {};
	let currentListKey: string | null = null;

	for (const rawLine of frontmatter.split("\n")) {
		const line = rawLine.trimEnd();
		if (!line.trim()) continue;

		const listItem = line.match(/^\s*-\s+(.+)$/);
		if (listItem && currentListKey) {
			const existing = values[currentListKey];
			values[currentListKey] = [
				...(Array.isArray(existing) ? existing : []),
				String(parseScalar(listItem[1] ?? "")),
			];
			continue;
		}

		const field = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
		if (!field) {
			throw new Error(`Invalid frontmatter line in ${path}: ${rawLine}`);
		}

		const key = field[1] ?? "";
		const value = field[2] ?? "";
		currentListKey = value ? null : key;
		values[key] = value ? parseScalar(value) : [];
	}

	const name = values.name;
	const title = values.title;
	const description = values.description;
	if (typeof name !== "string" || !name) {
		throw new Error(`MCP resource ${path} is missing name`);
	}
	if (typeof title !== "string" || !title) {
		throw new Error(`MCP resource ${path} is missing title`);
	}
	if (typeof description !== "string" || !description) {
		throw new Error(`MCP resource ${path} is missing description`);
	}

	const priority =
		typeof values.priority === "number" ? values.priority : DEFAULT_PRIORITY;
	const audience = Array.isArray(values.audience)
		? values.audience.map(String)
		: [...DEFAULT_AUDIENCE];
	if (!audience.every((value) => value === "assistant")) {
		throw new Error(`MCP resource ${path} has unsupported audience`);
	}

	return {
		name,
		title,
		description,
		priority,
		audience: audience as ResourceFrontmatter["audience"],
		body,
	};
};

export const compileResourceFiles = ({
	baseUrl,
	files,
}: {
	baseUrl: string | URL;
	files: readonly string[];
}): AutumnMcpResourceDoc[] =>
	files.map((file) => {
		const url = new URL(file, baseUrl);
		const parsed = parseResourceMarkdown({
			path: file,
			text: readFileSync(url, "utf8"),
		});

		return {
			name: parsed.name,
			title: parsed.title,
			description: parsed.description,
			priority: parsed.priority,
			audience: parsed.audience,
			uri: `autumn://docs/${parsed.name}`,
			text: parsed.body,
		};
	});
