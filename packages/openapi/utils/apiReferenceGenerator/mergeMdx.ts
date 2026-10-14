import { existsSync, readFileSync } from "node:fs";
import type { ParsedOperation } from "./parseOpenApi.js";

const IMPORTS = `import { DynamicParamField } from "/snippets/dynamic-param-field.jsx";
import { DynamicResponseField } from "/snippets/dynamic-response-field.jsx";
import { DynamicResponseExample } from "/snippets/dynamic-response-example.jsx";`;

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
		const manualContent = readFileSync(manualMdxPath, "utf-8");

		const hasAllImports =
			manualContent.includes("DynamicParamField") &&
			manualContent.includes("DynamicResponseField") &&
			manualContent.includes("DynamicResponseExample");

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

	const title =
		operation.summary ?? formatOperationIdAsTitle(operation.operationId);
	const frontmatter = `---
title: "${title}"
openapi: "openapi ${operation.method} ${operation.path}"
---`;

	return `${frontmatter}\n\n${IMPORTS}\n\n${generatedContent}`;
}

function formatOperationIdAsTitle(operationId: string): string {
	const words = operationId
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/[\s_-]+/);

	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
