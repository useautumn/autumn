import { LATEST_VERSION } from "@autumn/shared";
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

	const { writeLatestOpenApi, writeLatestOpenApiStripped } = await import(
		"./latest/openapi.js"
	);

	console.log(
		`Generating OpenAPI specs v${LATEST_VERSION} (full + stripped)...`,
	);
	await Promise.all([
		writeLatestOpenApi({ outputFilePath: paths.openApiOutput }),
		writeLatestOpenApiStripped({
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
