import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { generateApiReference } from "../apiReferenceGenerator/index.js";
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
 * - Strips JSDoc tags from descriptions
 * - Transforms Speakeasy code samples to use autumn-js format
 * - Copies schema examples to response content level
 */
export function transformOpenApiForMintlify(yamlContent: string): string {
	const doc = yaml.parse(yamlContent) as Record<string, unknown>;
	const schemas = (doc.components as Record<string, unknown>)?.schemas as
		| Record<string, unknown>
		| undefined;
	transformNode(doc, schemas);
	return yaml.stringify(doc);
}

/**
 * Generates Mintlify documentation from OpenAPI spec.
 *
 * 1. Transforms OpenAPI (strips JSDoc tags, fixes code samples)
 * 2. Generates API reference MDX files with dynamic parameter fields
 */
export async function generateMintlifyDocs({
	openApiPath,
	docsDir,
}: {
	openApiPath: string;
	docsDir: string;
}): Promise<void> {
	// Transform OpenAPI for Mintlify
	console.log("Transforming OpenAPI for Mintlify docs...");
	const yamlContent = readFileSync(openApiPath, "utf-8");
	const transformedYaml = transformOpenApiForMintlify(yamlContent);
	writeFileSync(openApiPath, transformedYaml);
	console.log("Mintlify transformation complete");

	// Generate API reference MDX files
	console.log("Generating API reference MDX files...");
	const manualMdxDir = path.resolve(docsDir, "../api-reference-generator");
	const outputMdxDir = path.resolve(docsDir, "api-reference");
	await generateApiReference({
		openApiPath,
		manualMdxDir,
		outputDir: outputMdxDir,
	});
	console.log("API reference MDX generation complete");
}
