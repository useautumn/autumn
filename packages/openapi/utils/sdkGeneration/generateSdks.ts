import { execAsyncQuiet } from "./exec.js";
import { patchPySdkHooks } from "./patchPySdkHooks.js";
import { patchPythonSdkGlobalDefaults } from "./patchPythonSdk.js";
import { patchTsSdkHooks } from "./patchTsSdkHooks.js";

/**
 * Generates the TypeScript SDK using Speakeasy and builds it (quiet mode for parallel).
 */
async function generateTypeScriptSdkQuiet({
	speakeasySdkDir,
}: {
	speakeasySdkDir: string;
}): Promise<void> {
	await execAsyncQuiet({
		command: "speakeasy",
		args: ["run", "-t", "autumn", "-y", "-o", "console"],
		cwd: speakeasySdkDir,
		label: "TypeScript SDK generation",
	});

	patchTsSdkHooks({ speakeasySdkDir });

	await execAsyncQuiet({
		command: "bun",
		args: ["run", "build"],
		cwd: speakeasySdkDir,
		label: "TypeScript SDK build",
	});
}

/**
 * Generates the Python SDK using Speakeasy (quiet mode for parallel).
 */
async function generatePythonSdkQuiet({
	speakeasySdkDir,
	pythonSdkDir,
}: {
	speakeasySdkDir: string;
	pythonSdkDir: string;
}): Promise<void> {
	await execAsyncQuiet({
		command: "speakeasy",
		args: ["run", "-t", "autumn-python", "-y", "-o", "console"],
		cwd: speakeasySdkDir,
		label: "Python SDK generation",
	});

	patchPythonSdkGlobalDefaults({ pythonSdkDir });
	patchPySdkHooks({ pythonSdkDir });
}

/**
 * Generates both TypeScript and Python SDKs in parallel.
 */
export async function generateSdksInParallel({
	speakeasySdkDir,
	pythonSdkDir,
}: {
	speakeasySdkDir: string;
	pythonSdkDir: string;
}): Promise<void> {
	// Both `speakeasy run`s use packages/sdk/.speakeasy; parallel clobbers models.
	console.log("Generating TypeScript and Python SDKs...");

	try {
		await generateTypeScriptSdkQuiet({ speakeasySdkDir });
		console.log("✓ TypeScript SDK generated and built successfully");
	} catch (reason) {
		console.error("✗ TypeScript SDK generation failed:", reason);
		throw new Error("SDK generation failed");
	}

	try {
		await generatePythonSdkQuiet({ speakeasySdkDir, pythonSdkDir });
		console.log("✓ Python SDK generated and patched successfully");
	} catch (reason) {
		console.error("✗ Python SDK generation failed:", reason);
		throw new Error("SDK generation failed");
	}
}
