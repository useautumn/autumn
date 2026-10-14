import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface OpenApiPaths {
	openApiDir: string;
	openApiOutput: string;
	openApiStrippedOutput: string;
	openApiInternalOutput: string;
	tsSdkDir: string;
	pythonSdkDir: string;
	docsApiDir: string;
	docsOpenApiPath: string;
	docsDir: string;
	autumnJsGeneratedDir: string;
	autumnJsSchemasPath: string;
	svixTransformsDir: string;
}

export function resolvePaths(): OpenApiPaths {
	const currentFilePath = fileURLToPath(import.meta.url);
	const currentDirPath = path.dirname(currentFilePath);
	const openApiDir = path.resolve(currentDirPath, "..");

	const tsSdkDir = path.resolve(openApiDir, "../sdk");
	const pythonSdkDir = path.resolve(openApiDir, "../../others/python-sdk");
	const docsApiDir = path.resolve(openApiDir, "../../apps/docs/mintlify/api");
	const docsDir = path.resolve(openApiDir, "../../apps/docs/mintlify");
	const autumnJsGeneratedDir = path.resolve(
		openApiDir,
		"../autumn-js/src/generated",
	);
	const svixTransformsDir = path.resolve(
		openApiDir,
		"../../others/svix-transforms",
	);
	mkdirSync(openApiDir, { recursive: true });
	mkdirSync(docsApiDir, { recursive: true });
	mkdirSync(autumnJsGeneratedDir, { recursive: true });

	return {
		openApiDir,
		openApiOutput: path.join(openApiDir, "openapi.yml"),
		openApiStrippedOutput: path.join(openApiDir, "openapi-stripped.yml"),
		openApiInternalOutput: path.join(openApiDir, "openapi-internal.yml"),
		tsSdkDir,
		pythonSdkDir,
		docsApiDir,
		docsOpenApiPath: path.join(docsApiDir, "openapi.yml"),
		docsDir,
		autumnJsGeneratedDir,
		autumnJsSchemasPath: path.join(autumnJsGeneratedDir, "schemas.ts"),
		svixTransformsDir,
	};
}
