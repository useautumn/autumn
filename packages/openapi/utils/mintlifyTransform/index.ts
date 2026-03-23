import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
	type GeneratedWebhookPage,
	generateApiReference,
} from "../apiReferenceGenerator/index.js";
import { removeInternalFields } from "../openapiTransform/removeInternalFields.js";
import { transformNode } from "./transformNode.js";

export { stripJsDocTags } from "./stripJsDocTags.js";
export {
	transformPythonCodeSample,
	transformTypeScriptCodeSample,
} from "./transformCodeSamples.js";
export { resolveSchemaExample, transformNode } from "./transformNode.js";

/**
 * Transforms an OpenAPI YAML document for Mintlify consumption.
 *
 * - Removes internal fields (marked with `internal: true` or `x-internal: true`)
 * - Strips JSDoc tags from descriptions
 * - Transforms Speakeasy code samples to use autumn-js format
 * - Copies schema examples to response content level
 */
export function transformOpenApiForMintlify(yamlContent: string): string {
	const doc = yaml.parse(yamlContent) as Record<string, unknown>;
	const schemas = (doc.components as Record<string, unknown>)?.schemas as
		| Record<string, unknown>
		| undefined;

	removeInternalFields({ openApiDocument: doc });

	transformNode(doc, schemas);
	return yaml.stringify(doc);
}

/**
 * Generates Mintlify documentation from OpenAPI spec.
 *
 * 1. Transforms OpenAPI (strips JSDoc tags, fixes code samples)
 * 2. Generates API reference MDX files with dynamic parameter fields
 * 3. Updates docs.json navigation with webhook groups
 */
export async function generateMintlifyDocs({
	openApiPath,
	docsDir,
}: {
	openApiPath: string;
	docsDir: string;
}): Promise<void> {
	console.log("Transforming OpenAPI for Mintlify docs...");
	const yamlContent = readFileSync(openApiPath, "utf-8");
	const transformedYaml = transformOpenApiForMintlify(yamlContent);
	writeFileSync(openApiPath, transformedYaml);
	console.log("Mintlify transformation complete");

	console.log("Generating API reference MDX files...");
	const manualMdxDir = path.resolve(docsDir, "../api-reference-generator");
	const outputMdxDir = path.resolve(docsDir, "api-reference");
	const { webhookPages } = await generateApiReference({
		openApiPath,
		manualMdxDir,
		outputDir: outputMdxDir,
	});
	console.log("API reference MDX generation complete");

	if (webhookPages.length > 0) {
		updateDocsJsonWebhooks({ docsDir, webhookPages });
	}
}

/**
 * Updates the docs.json navigation to include webhook groups in the
 * API Reference tab, replacing any previously generated webhook groups.
 */
function updateDocsJsonWebhooks({
	docsDir,
	webhookPages,
}: {
	docsDir: string;
	webhookPages: GeneratedWebhookPage[];
}) {
	const docsJsonPath = path.join(docsDir, "docs.json");
	const docsJson = JSON.parse(readFileSync(docsJsonPath, "utf-8"));

	const tabs = docsJson.navigation?.tabs;
	if (!Array.isArray(tabs)) return;

	const apiTab = tabs.find(
		(tab: Record<string, unknown>) => tab.tab === "API Reference",
	);
	if (!apiTab?.groups || !Array.isArray(apiTab.groups)) return;

	// Build nested subgroups under a single "Webhook Events" group
	const groupedPages = new Map<string, string[]>();
	for (const page of webhookPages) {
		const existing = groupedPages.get(page.group) ?? [];
		existing.push(page.pagePath);
		groupedPages.set(page.group, existing);
	}

	const subgroups = [...groupedPages.entries()].map(
		([groupName, pages]) => ({
			group: groupName,
			pages,
		}),
	);

	const webhookEventsGroup = {
		group: "Webhook Events",
		pages: subgroups,
	};

	// Remove any existing "Webhook Events" or old "Webhooks:" groups
	const filteredGroups = apiTab.groups.filter(
		(group: Record<string, unknown>) => {
			const name = group.group as string | undefined;
			return name && !name.startsWith("Webhooks:") && name !== "Webhook Events";
		},
	);

	// Insert before "Platform (Beta)" if it exists, otherwise at the end
	const platformIdx = filteredGroups.findIndex(
		(g: Record<string, unknown>) => g.group === "Platform (Beta)",
	);
	if (platformIdx >= 0) {
		filteredGroups.splice(platformIdx, 0, webhookEventsGroup);
	} else {
		filteredGroups.push(webhookEventsGroup);
	}

	apiTab.groups = filteredGroups;

	writeFileSync(docsJsonPath, `${JSON.stringify(docsJson, null, "\t")}\n`);
	console.log(
		`  Updated docs.json with ${subgroups.length} webhook subgroup(s)`,
	);
}
