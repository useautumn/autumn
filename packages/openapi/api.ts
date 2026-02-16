import { generateMintlifyDocs } from "./utils/mintlifyTransform.js";
import { resolvePaths } from "./utils/paths.js";
import {
	generateSdksInParallel,
	mergeCodeSamples,
} from "./utils/sdkGeneration.js";

async function main() {
	const paths = resolvePaths();

	// Import and write OpenAPI spec (v2.1 only)
	const { writeOpenApi_2_1_0 } = await import("./v2.1/openapi2.1.js");

	console.log("Generating OpenAPI spec v2.1...");
	await writeOpenApi_2_1_0({ outputFilePath: paths.openApiOutput });
	console.log(`OpenAPI document exported to ${paths.openApiOutput}`);

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
		docsDir: paths.docsApiDir,
	});

	console.log("Done!");
}

main().catch((error) => {
	console.error("Failed:", error);
	process.exit(1);
});
