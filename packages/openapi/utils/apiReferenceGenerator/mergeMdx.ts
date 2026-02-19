import { existsSync, readFileSync } from "node:fs";
import type { ParsedOperation } from "./parseOpenApi.js";

const IMPORTS = `import { DynamicParamField } from "/components/dynamic-param-field.jsx";
import { DynamicResponseField } from "/components/dynamic-response-field.jsx";
import { DynamicResponseExample } from "/components/dynamic-response-example.jsx";`;

/**
 * Merge manual MDX content with generated fields.
 * If manual MDX exists, append generated content after it.
 * If no manual MDX exists, generate minimal frontmatter + imports + generated content.
 */
export function mergeMdx({
	manualMdxPath,
	generatedContent,
	operation,
}: {
	manualMdxPath: string;
	generatedContent: string;
	operation: ParsedOperation;
}): string {
	if (existsSync(manualMdxPath)) {
		// Read manual MDX and append generated content
		const manualContent = readFileSync(manualMdxPath, "utf-8");

		// Check if all imports already exist
		const hasAllImports =
			manualContent.includes("DynamicParamField") &&
			manualContent.includes("DynamicResponseField") &&
			manualContent.includes("DynamicResponseExample");

		// If manual content has frontmatter but missing imports, add them after frontmatter
		if (!hasAllImports) {
			const frontmatterMatch = manualContent.match(/^---\n[\s\S]*?\n---\n/);
			if (frontmatterMatch) {
				const frontmatter = frontmatterMatch[0];
				const restContent = manualContent.slice(frontmatter.length).trim();
				return `${frontmatter}\n${IMPORTS}\n\n${restContent}\n\n${generatedContent}`;
			}
		}

		return `${manualContent.trim()}\n\n${generatedContent}`;
	}

	// Generate minimal frontmatter
	const title =
		operation.summary ?? formatOperationIdAsTitle(operation.operationId);
	const frontmatter = `---
title: "${title}"
openapi: "openapi ${operation.method} ${operation.path}"
---`;

	return `${frontmatter}\n\n${IMPORTS}\n\n${generatedContent}`;
}

/**
 * Convert operationId to a human-readable title.
 * e.g., "getOrCreate" -> "Get Or Create"
 */
function formatOperationIdAsTitle(operationId: string): string {
	// Split on camelCase boundaries
	const words = operationId
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/[\s_-]+/);

	// Capitalize first letter of each word
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
