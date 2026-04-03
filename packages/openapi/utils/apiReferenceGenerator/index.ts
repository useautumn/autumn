import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { webhookRegistry } from "@autumn/shared";
import { generateFields, generateWebhookFields } from "./generateFields.js";
import { mergeMdx } from "./mergeMdx.js";
import { parseOpenApi, parseWebhooks } from "./parseOpenApi.js";

export interface GenerateApiReferenceOptions {
	openApiPath: string;
	manualMdxDir: string;
	outputDir: string;
}

export interface GeneratedWebhookPage {
	group: string;
	pagePath: string;
}

/**
 * Generate API reference MDX files from an OpenAPI spec.
 *
 * For each operation in the OpenAPI spec:
 * 1. Parse request body and response schemas
 * 2. Generate DynamicParamField/DynamicResponseField components
 * 3. Merge with manual MDX content (if exists)
 * 4. Write to output directory: {outputDir}/{tag}/{operationId}.mdx
 *
 * Also generates webhook MDX files from the `webhooks` section
 * and returns group metadata so callers can update navigation.
 */
export async function generateApiReference({
	openApiPath,
	manualMdxDir,
	outputDir,
}: GenerateApiReferenceOptions): Promise<{
	webhookPages: GeneratedWebhookPage[];
}> {
	console.log(`  Reading OpenAPI spec from: ${openApiPath}`);

	const operations = parseOpenApi({ openApiPath });
	console.log(`  Found ${operations.length} operations`);

	let generated = 0;

	for (const operation of operations) {
		const { tag, operationId } = operation;

		const manualMdxPath = path.join(manualMdxDir, tag, `${operationId}.mdx`);
		const outputPath = path.join(outputDir, tag, `${operationId}.mdx`);

		const generatedContent = generateFields({ operation });

		const finalMdx = mergeMdx({
			manualMdxPath,
			generatedContent,
			operation,
		});

		mkdirSync(path.dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, finalMdx, "utf-8");
		generated++;

		console.log(`  Generated: ${tag}/${operationId}.mdx`);
	}

	// Build operationId -> group mapping from the shared registry
	const groupMap: Record<string, string> = {};
	for (const definition of webhookRegistry) {
		groupMap[definition.operationId] = definition.group;
	}

	const webhooks = parseWebhooks({ openApiPath, groupMap });
	const webhookPages: GeneratedWebhookPage[] = [];

	if (webhooks.length > 0) {
		console.log(`  Found ${webhooks.length} webhooks`);

		for (const webhook of webhooks) {
			const generatedContent = generateWebhookFields({ webhook });

			const title =
				webhook.summary ?? formatEventTypeAsTitle(webhook.eventType);
			const frontmatter = `---\ntitle: "${title}"\nopenapi: "api/openapi.yml webhook ${webhook.eventType}"\n---`;

			const finalMdx = `${frontmatter}\n\n${generatedContent}`;

			const relativePage = `api-reference/webhooks/${webhook.operationId}`;
			const outputPath = path.join(
				outputDir,
				"webhooks",
				`${webhook.operationId}.mdx`,
			);
			mkdirSync(path.dirname(outputPath), { recursive: true });
			writeFileSync(outputPath, finalMdx, "utf-8");
			generated++;

			webhookPages.push({
				group: webhook.group,
				pagePath: relativePage,
			});

			console.log(`  Generated webhook: webhooks/${webhook.operationId}.mdx`);
		}
	}

	// Also generate placeholder pages for registry entries without schemas
	// (they won't be in the OpenAPI spec but we still want a docs page)
	const generatedOperationIds = new Set(webhooks.map((w) => w.operationId));
	for (const definition of webhookRegistry) {
		if (generatedOperationIds.has(definition.operationId)) continue;

		const title = definition.title;
		const mdx = `---\ntitle: "${title}"\n---\n\n${definition.description}\n\n<Note>Schema documentation for this event type is coming soon.</Note>\n`;

		const relativePage = `api-reference/webhooks/${definition.operationId}`;
		const outputPath = path.join(
			outputDir,
			"webhooks",
			`${definition.operationId}.mdx`,
		);
		mkdirSync(path.dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, mdx, "utf-8");
		generated++;

		webhookPages.push({
			group: definition.group,
			pagePath: relativePage,
		});

		console.log(
			`  Generated webhook placeholder: webhooks/${definition.operationId}.mdx`,
		);
	}

	console.log(`  API reference generation complete: ${generated} generated`);

	return { webhookPages };
}

function formatEventTypeAsTitle(eventType: string): string {
	return eventType
		.split(".")
		.map((segment) =>
			segment
				.split("_")
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" "),
		)
		.join(" — ");
}

// Re-export types for consumers
export type { ParsedOperation, SchemaField } from "./parseOpenApi.js";
