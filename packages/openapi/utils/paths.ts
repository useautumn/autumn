import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface OpenApiPaths {
	/** packages/openapi/ directory */
	openApiDir: string;
	/** packages/openapi/openapi.yml */
	openApiOutput: string;
	/** packages/sdk/ directory */
	tsSdkDir: string;
	/** others/python-sdk/ directory */
	pythonSdkDir: string;
	/** apps/docs/mintlify/api/ directory */
	docsApiDir: string;
	/** apps/docs/mintlify/api/openapi.yml */
	docsOpenApiPath: string;
	/** apps/docs/mintlify/ directory */
	docsDir: string;
}

/**
 * Resolves all paths needed for OpenAPI generation.
 * Also creates necessary directories.
 */
export function resolvePaths(): OpenApiPaths {
	const currentFilePath = fileURLToPath(import.meta.url);
	const currentDirPath = path.dirname(currentFilePath);
	// Go up from utils/ to packages/openapi/
	const openApiDir = path.resolve(currentDirPath, "..");

	const tsSdkDir = path.resolve(openApiDir, "../sdk");
	const pythonSdkDir = path.resolve(openApiDir, "../../others/python-sdk");
	const docsApiDir = path.resolve(openApiDir, "../../apps/docs/mintlify/api");
	const docsDir = path.resolve(openApiDir, "../../apps/docs/mintlify");

	// Ensure directories exist
	mkdirSync(openApiDir, { recursive: true });
	mkdirSync(docsApiDir, { recursive: true });

	return {
		openApiDir,
		openApiOutput: path.join(openApiDir, "openapi.yml"),
		tsSdkDir,
		pythonSdkDir,
		docsApiDir,
		docsOpenApiPath: path.join(docsApiDir, "openapi.yml"),
		docsDir,
	};
}
