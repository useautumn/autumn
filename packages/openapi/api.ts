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

	const {
		writeLatestOpenApi,
		writeLatestOpenApiStripped,
		writeLatestOpenApiInternal,
	} = await import("./latest/openapi.js");

	console.log(
		`Generating OpenAPI specs v${LATEST_VERSION} (full + stripped + internal)...`,
	);
	await Promise.all([
		writeLatestOpenApi({ outputFilePath: paths.openApiOutput }),
		writeLatestOpenApiStripped({
			outputFilePath: paths.openApiStrippedOutput,
		}),
		writeLatestOpenApiInternal({
			outputFilePath: paths.openApiInternalOutput,
		}),
	]);
	console.log(
		`OpenAPI documents exported to ${paths.openApiOutput} and ${paths.openApiStrippedOutput}`,
	);

	if (process.argv.includes("--spec-only")) return;

	await generateSdksInParallel({
		speakeasySdkDir: paths.tsSdkDir,
		pythonSdkDir: paths.pythonSdkDir,
	});

	mergeCodeSamples({
		speakeasySdkDir: paths.tsSdkDir,
		pythonSdkDir: paths.pythonSdkDir,
		outputPath: paths.docsOpenApiPath,
	});

	await generateMintlifyDocs({
		openApiPath: paths.docsOpenApiPath,
		docsDir: paths.docsDir,
	});

	syncSvixTransforms({
		svixTransformsDir: paths.svixTransformsDir,
		docsDir: paths.docsDir,
	});

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
