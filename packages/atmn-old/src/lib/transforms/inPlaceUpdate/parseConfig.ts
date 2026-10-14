import { readFileSync } from "node:fs";

export interface ParsedEntity {
	id: string;
	type: "feature" | "plan" | "referral_program" | "reward" | "variant";
	varName: string;
	version?: number;
	startLine: number;
	endLine: number;
	lines: string[];
}

export interface ParsedIdentity {
	id: string;
	version?: number;
}

export interface ParsedDeclaration {
	requiresRuntimeIdentity: boolean;
	type: ParsedEntity["type"];
	varName: string;
}

export interface ParsedBlock {
	type: "import" | "comment" | "export" | "other";
	startLine: number;
	endLine: number;
	lines: string[];
	declaration?: ParsedDeclaration;
	entity?: ParsedEntity;
}

export interface ParsedConfig {
	blocks: ParsedBlock[];
	entities: ParsedEntity[];
	lines: string[];
	source: string;
}

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

function extractVarName(line: string): string | null {
	const match = line.match(/export\s+const\s+(\w+)\s*=/);
	return match ? (match[1] ?? null) : null;
}

function determineEntityType(lines: string[]): ParsedEntity["type"] | null {
	const joined = lines.join("\n");
	if (/=\s*reward\s*\(/.test(joined)) return "reward";
	if (/=\s*referralProgram\s*\(/.test(joined)) return "referral_program";

	if (/type:\s*['"](?:boolean|metered|credit_system)['"]/.test(joined)) {
		return "feature";
	}
	if (/=\s*feature\s*\(/.test(joined)) {
		return "feature";
	}

	if (/=\s*\w+\.variant\s*\(/.test(joined)) {
		return "variant";
	}

	if (/items:\s*\[/.test(joined) || /features:\s*\[/.test(joined)) {
		return "plan";
	}
	if (/=\s*plan\s*\(/.test(joined)) {
		return "plan";
	}

	return null;
}

const isResourceExpression = (source: string) =>
	/=\s*(?:feature|plan|referralProgram|reward)\s*\(/.test(source) ||
	/=\s*\w+\.variant\s*\(/.test(source);

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

		if (trimmed === "") {
			i++;
			continue;
		}

		if (trimmed.startsWith("import ")) {
			const startLine = i;
			while (
				i < lines.length &&
				!/(?:["'];?|;)\s*(?:\/\/.*|\/\*.*)?$/.test(lines[i]!)
			) {
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

		if (trimmed.startsWith("export const")) {
			const startLine = i;
			const varName = extractVarName(line);

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

				if (foundStart && depth === 0) {
					break;
				}
				i++;
			}

			const endLine = i;
			const blockLines = lines.slice(startLine, endLine + 1);

			const entityType = determineEntityType(blockLines);
			const blockSource = blockLines.join("\n");
			const declaration =
				entityType && varName && isResourceExpression(blockSource)
					? {
							requiresRuntimeIdentity: !/id:\s*['"][^'"]+['"]/.test(
								blockSource,
							),
							type: entityType,
							varName,
						}
					: undefined;
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
					declaration,
					entity,
				});

				entities.push(entity);
			} else {
				blocks.push({
					type: "other",
					startLine,
					endLine,
					lines: blockLines,
					declaration,
				});
			}

			i++;
			continue;
		}

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
