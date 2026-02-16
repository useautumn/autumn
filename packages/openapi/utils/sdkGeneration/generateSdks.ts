import { execAsyncQuiet } from "./exec.js";
import { patchPythonSdkGlobalDefaults } from "./patchPythonSdk.js";

/**
 * Generates the TypeScript SDK using Speakeasy and builds it (quiet mode for parallel).
 */
async function generateTypeScriptSdkQuiet({
	speakeasySdkDir,
}: {
	speakeasySdkDir: string;
}): Promise<void> {
	await execAsyncQuiet({
		command: "bunx",
		args: ["speakeasy", "run", "-t", "autumn", "-y", "-o", "console"],
		cwd: speakeasySdkDir,
		label: "TypeScript SDK generation",
	});

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
		command: "bunx",
		args: ["speakeasy", "run", "-t", "autumn-python", "-y", "-o", "console"],
		cwd: speakeasySdkDir,
		label: "Python SDK generation",
	});

	patchPythonSdkGlobalDefaults({ pythonSdkDir });
}

/**
 * Generates both TypeScript and Python SDKs in parallel.
 * Output is captured to prevent interleaving.
 */
export async function generateSdksInParallel({
	speakeasySdkDir,
	pythonSdkDir,
}: {
	speakeasySdkDir: string;
	pythonSdkDir: string;
}): Promise<void> {
	console.log("Generating TypeScript and Python SDKs in parallel...");

	const [tsResult, pyResult] = await Promise.allSettled([
		generateTypeScriptSdkQuiet({ speakeasySdkDir }),
		generatePythonSdkQuiet({ speakeasySdkDir, pythonSdkDir }),
	]);

	// Report results
	if (tsResult.status === "fulfilled") {
		console.log("✓ TypeScript SDK generated and built successfully");
	} else {
		console.error("✗ TypeScript SDK generation failed:", tsResult.reason);
	}

	if (pyResult.status === "fulfilled") {
		console.log("✓ Python SDK generated and patched successfully");
	} else {
		console.error("✗ Python SDK generation failed:", pyResult.reason);
	}

	// Throw if any failed
	if (tsResult.status === "rejected" || pyResult.status === "rejected") {
		throw new Error("SDK generation failed");
	}
}
