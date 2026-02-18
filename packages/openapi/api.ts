import { generateMintlifyDocs } from "./utils/mintlifyTransform.js";
import { resolvePaths } from "./utils/paths.js";
import {
	generateSdksInParallel,
	mergeCodeSamples,
} from "./utils/sdkGeneration.js";
import { generateZodSchemas } from "./utils/zodSchemaGeneration.js";

async function main() {
	const paths = resolvePaths();

	// Import and write OpenAPI spec (v2.1 only)
	const { writeOpenApi_2_1_0, writeOpenApi_2_1_0_Stripped } = await import(
		"./v2.1/openapi2.1.js"
	);

	console.log("Generating OpenAPI specs v2.1 (full + stripped)...");
	await Promise.all([
		writeOpenApi_2_1_0({ outputFilePath: paths.openApiOutput }),
		writeOpenApi_2_1_0_Stripped({
			outputFilePath: paths.openApiStrippedOutput,
		}),
	]);
	console.log(
		`OpenAPI documents exported to ${paths.openApiOutput} and ${paths.openApiStrippedOutput}`,
	);

	// Generate TypeScript and Python SDKs in parallel
	await generateSdksInParallel({
		speakeasySdkDir: paths.tsSdkDir,
		pythonSdkDir: paths.pythonSdkDir,
	});

	// Merge code samples into OpenAPI for docs
	mergeCodeSamples({
		speakeasySdkDir: paths.tsSdkDir,
		pythonSdkDir: paths.pythonSdkDir,
		outputPath: paths.docsOpenApiPath,
	});

	// Generate Mintlify docs (transform OpenAPI + generate MDX)
	await generateMintlifyDocs({
		openApiPath: paths.docsOpenApiPath,
		docsDir: paths.docsDir,
	});

	// Generate Zod schemas for autumn-js from SDK types
	await generateZodSchemas({
		sdkDir: paths.tsSdkDir,
		outputDir: paths.autumnJsGeneratedDir,
	});

	console.log("Done!");
}

main().catch((error) => {
	console.error("Failed:", error);
	process.exit(1);
});
