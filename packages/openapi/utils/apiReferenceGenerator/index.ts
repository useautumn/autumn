import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateFields } from "./generateFields.js";
import { mergeMdx } from "./mergeMdx.js";
import { parseOpenApi } from "./parseOpenApi.js";

export interface GenerateApiReferenceOptions {
	openApiPath: string;
	manualMdxDir: string;
	outputDir: string;
}

/**
 * Generate API reference MDX files from an OpenAPI spec.
 *
 * For each operation in the OpenAPI spec:
 * 1. Parse request body and response schemas
 * 2. Generate DynamicParamField/DynamicResponseField components
 * 3. Merge with manual MDX content (if exists)
 * 4. Write to output directory: {outputDir}/{tag}/{operationId}.mdx
 */
export async function generateApiReference({
	openApiPath,
	manualMdxDir,
	outputDir,
}: GenerateApiReferenceOptions): Promise<void> {
	console.log(`  Reading OpenAPI spec from: ${openApiPath}`);

	// Parse OpenAPI spec
	const operations = parseOpenApi({ openApiPath });
	console.log(`  Found ${operations.length} operations`);

	let generated = 0;
	const skipped = 0;

	for (const operation of operations) {
		const { tag, operationId } = operation;

		// Determine file paths
		const manualMdxPath = path.join(manualMdxDir, tag, `${operationId}.mdx`);
		const outputPath = path.join(outputDir, tag, `${operationId}.mdx`);

		// Generate fields MDX
		const generatedContent = generateFields({ operation });

		// Merge with manual MDX (if exists)
		const finalMdx = mergeMdx({
			manualMdxPath,
			generatedContent,
			operation,
		});

		// Ensure output directory exists
		mkdirSync(path.dirname(outputPath), { recursive: true });

		// Write output file
		writeFileSync(outputPath, finalMdx, "utf-8");
		generated++;

		console.log(`  Generated: ${tag}/${operationId}.mdx`);
	}

	console.log(
		`  API reference generation complete: ${generated} generated, ${skipped} skipped`,
	);
}

// Re-export types for consumers
export type { ParsedOperation, SchemaField } from "./parseOpenApi.js";
