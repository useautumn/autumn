import {
	generateMintlifyDocs,
	syncSvixTransforms,
} from "./utils/mintlifyTransform.js";
import { resolvePaths } from "./utils/paths.js";
import {
	generateSdksInParallel,
	mergeCodeSamples,
} from "./utils/sdkGeneration.js";
import { generateZodSchemas } from "./utils/zodSchemaGeneration.js";

async function main() {
	const paths = resolvePaths();

	const {
		writeOpenApi_2_3_0,
		writeOpenApi_2_3_0_Stripped,
		writeOpenApi_2_3_0_Internal,
	} = await import("./v2.3/openapi2.3.js");

	console.log("Generating OpenAPI specs v2.3 (full + stripped + internal)...");
	await Promise.all([
		writeOpenApi_2_3_0({ outputFilePath: paths.openApiOutput }),
		writeOpenApi_2_3_0_Stripped({
			outputFilePath: paths.openApiStrippedOutput,
		}),
		// Internal only: never fed to the SDKs, never merged into the docs spec.
		writeOpenApi_2_3_0_Internal({
			outputFilePath: paths.openApiInternalOutput,
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

	// Sync Slack/Discord Svix transform sources into docs snippets
	syncSvixTransforms({
		svixTransformsDir: paths.svixTransformsDir,
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
