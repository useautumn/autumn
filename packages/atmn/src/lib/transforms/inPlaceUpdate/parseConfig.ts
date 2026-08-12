/**
 * Parse existing autumn.config.ts to extract entity information
 *
 * Uses simple line-based parsing instead of AST to avoid position corruption issues
 */

import { readFileSync } from "node:fs";

export interface ParsedEntity {
	id: string;
	type: "feature" | "plan" | "referral_program" | "reward" | "variant";
	varName: string;
	version?: number;
	/** Starting line index (0-based) */
	startLine: number;
	/** Ending line index (0-based, inclusive) */
	endLine: number;
	/** The original source lines */
	lines: string[];
}

export interface ParsedIdentity {
	id: string;
	version?: number;
}

export interface ParsedBlock {
	type: "import" | "comment" | "export" | "other";
	startLine: number;
	endLine: number;
	lines: string[];
	/** For export blocks */
	entity?: ParsedEntity;
}

export interface ParsedConfig {
	/** All parsed blocks in order */
	blocks: ParsedBlock[];
	/** Just the managed config entity blocks */
	entities: ParsedEntity[];
	/** Original source lines */
	lines: string[];
	/** Original source */
	source: string;
}

/** Resolve a literal ID, falling back to the generated variable name. */
function extractIdentity({
	identitiesByTypeAndVarName,
	lines,
	type,
	varName,
}: {
	identitiesByTypeAndVarName?: Map<
		ParsedEntity["type"],
		Map<string, ParsedIdentity>
	>;
	lines: string[];
	type: ParsedEntity["type"] | null;
	varName: string | null;
}): ParsedIdentity | null {
	const joined = lines.join("\n");
	const mapped =
		type && varName
			? identitiesByTypeAndVarName?.get(type)?.get(varName)
			: undefined;
	const id = joined.match(/id:\s*['"]([^'"]+)['"]/)?.[1];
	if (!id) return mapped ?? null;
	if (mapped?.id === id) return mapped;
	const version = joined.match(
		/id:\s*['"][^'"]+['"]\s*,?\s*version:\s*(\d+)/,
	)?.[1];
	return { id, version: version === undefined ? undefined : Number(version) };
}

/**
 * Extract variable name from export line
 * e.g., "export const myFeature = feature({" -> "myFeature"
 */
function extractVarName(line: string): string | null {
	const match = line.match(/export\s+const\s+(\w+)\s*=/);
	return match ? (match[1] ?? null) : null;
}

/**
 * Determine entity type from source lines
 */
function determineEntityType(lines: string[]): ParsedEntity["type"] | null {
	const joined = lines.join("\n");
	if (/=\s*reward\s*\(/.test(joined)) return "reward";
	if (/=\s*referralProgram\s*\(/.test(joined)) return "referral_program";

	// Check for feature indicators: type: 'boolean'|'metered'|'credit_system'
	if (/type:\s*['"](?:boolean|metered|credit_system)['"]/.test(joined)) {
		return "feature";
	}
	// Also check for feature() function call
	if (/=\s*feature\s*\(/.test(joined)) {
		return "feature";
	}

	if (/=\s*\w+\.variant\s*\(/.test(joined)) {
		return "variant";
	}

	// Check for plan indicators: items: [ array (or legacy features: [)
	if (/items:\s*\[/.test(joined) || /features:\s*\[/.test(joined)) {
		return "plan";
	}
	// Also check for plan() function call
	if (/=\s*plan\s*\(/.test(joined)) {
		return "plan";
	}

	return null;
}

/**
 * Parse an existing autumn.config.ts file using line-based parsing
 */
export function parseExistingConfig({
	configPath,
	identitiesByTypeAndVarName,
}: {
	configPath: string;
	identitiesByTypeAndVarName?: Map<
		ParsedEntity["type"],
		Map<string, ParsedIdentity>
	>;
}): ParsedConfig {
	const source = readFileSync(configPath, "utf-8");
	const lines = source.split("\n");

	const blocks: ParsedBlock[] = [];
	const entities: ParsedEntity[] = [];

	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Skip empty lines - they'll be regenerated as needed
		if (trimmed === "") {
			i++;
			continue;
		}

		// Import statement
		if (trimmed.startsWith("import ")) {
			const startLine = i;
			// Import can span multiple lines until semicolon
			while (i < lines.length && !lines[i]!.includes(";")) {
				i++;
			}
			const endLine = i;
			blocks.push({
				type: "import",
				startLine,
				endLine,
				lines: lines.slice(startLine, endLine + 1),
			});
			i++;
			continue;
		}

		// Single-line comment
		if (trimmed.startsWith("//")) {
			blocks.push({
				type: "comment",
				startLine: i,
				endLine: i,
				lines: [line],
			});
			i++;
			continue;
		}

		// Multi-line comment
		if (trimmed.startsWith("/*")) {
			const startLine = i;
			while (i < lines.length && !lines[i]!.includes("*/")) {
				i++;
			}
			const endLine = i;
			blocks.push({
				type: "comment",
				startLine,
				endLine,
				lines: lines.slice(startLine, endLine + 1),
			});
			i++;
			continue;
		}

		// Managed config export statement
		if (trimmed.startsWith("export const")) {
			const startLine = i;
			const varName = extractVarName(line);

			// Find the end of the export block
			// Track brace/paren depth to handle nested structures
			let depth = 0;
			let foundStart = false;

			while (i < lines.length) {
				const currentLine = lines[i]!;

				for (const char of currentLine) {
					if (char === "(" || char === "{" || char === "[") {
						depth++;
						foundStart = true;
					} else if (char === ")" || char === "}" || char === "]") {
						depth--;
					}
				}

				// End when we close all braces and see semicolon
				if (foundStart && depth === 0 && currentLine.includes(";")) {
					break;
				}
				i++;
			}

			const endLine = i;
			const blockLines = lines.slice(startLine, endLine + 1);

			const entityType = determineEntityType(blockLines);
			const identity = extractIdentity({
				identitiesByTypeAndVarName,
				lines: blockLines,
				type: entityType,
				varName,
			});

			if (identity && entityType && varName) {
				const entity: ParsedEntity = {
					...identity,
					type: entityType,
					varName,
					startLine,
					endLine,
					lines: blockLines,
				};

				blocks.push({
					type: "export",
					startLine,
					endLine,
					lines: blockLines,
					entity,
				});

				entities.push(entity);
			} else {
				// Unknown export, preserve as-is
				blocks.push({
					type: "other",
					startLine,
					endLine,
					lines: blockLines,
				});
			}

			i++;
			continue;
		}

		// Anything else - preserve as-is
		blocks.push({
			type: "other",
			startLine: i,
			endLine: i,
			lines: [line],
		});
		i++;
	}

	return {
		blocks,
		entities,
		lines,
		source,
	};
}
