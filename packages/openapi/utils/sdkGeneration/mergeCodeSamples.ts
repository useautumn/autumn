import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exec } from "./exec.js";

/**
 * Merges code sample overlays from TypeScript and Python SDKs into the OpenAPI spec.
 */
export function mergeCodeSamples({
	speakeasySdkDir,
	pythonSdkDir,
	outputPath,
}: {
	speakeasySdkDir: string;
	pythonSdkDir: string;
	outputPath: string;
}): void {
	console.log("Merging code samples from TypeScript and Python SDKs...");

	const baseOpenApiPath = path.join(
		speakeasySdkDir,
		".speakeasy/out.openapi.yaml",
	);
	const tsOverlayPath = path.join(
		speakeasySdkDir,
		".speakeasy/code-samples.overlay.yaml",
	);
	const pythonOverlayPath = path.join(
		pythonSdkDir,
		".speakeasy/code-samples.overlay.yaml",
	);

	// Apply TypeScript code samples
	exec({
		command: `bunx speakeasy overlay apply --schema "${baseOpenApiPath}" --overlay "${tsOverlayPath}" --out "${outputPath}"`,
		cwd: speakeasySdkDir,
	});

	// Apply Python code samples on top (if exists)
	if (existsSync(pythonOverlayPath)) {
		const tempPath = `${outputPath}.tmp`;
		exec({
			command: `bunx speakeasy overlay apply --schema "${outputPath}" --overlay "${pythonOverlayPath}" --out "${tempPath}"`,
			cwd: speakeasySdkDir,
		});

		// Move temp file to final location
		const tempContent = readFileSync(tempPath, "utf-8");
		writeFileSync(outputPath, tempContent);
		unlinkSync(tempPath);
		console.log("✓ Code samples merged (TypeScript + Python)");
	} else {
		console.log("✓ Code samples merged (TypeScript only)");
	}
}
