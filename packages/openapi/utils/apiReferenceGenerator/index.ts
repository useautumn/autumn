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

export async function generateApiReference({
	openApiPath,
	manualMdxDir,
	outputDir,
}: GenerateApiReferenceOptions): Promise<{
	webhookPages: GeneratedWebhookPage[];
	generatedPages: string[];
}> {
	console.log(`  Reading OpenAPI spec from: ${openApiPath}`);

	const operations = parseOpenApi({ openApiPath });
	console.log(`  Found ${operations.length} operations`);

	let generated = 0;
	const generatedPages: string[] = [];

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
		generatedPages.push(`api-reference/${tag}/${operationId}`);
		generated++;

		console.log(`  Generated: ${tag}/${operationId}.mdx`);
	}

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
			generatedPages.push(relativePage);
			generated++;

			webhookPages.push({
				group: webhook.group,
				pagePath: relativePage,
			});

			console.log(`  Generated webhook: webhooks/${webhook.operationId}.mdx`);
		}
	}

	console.log(`  API reference generation complete: ${generated} generated`);

	return { webhookPages, generatedPages };
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

export type { ParsedOperation, SchemaField } from "./parseOpenApi.js";
