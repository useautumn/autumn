import { assertSdkPatches } from "./assertSdkPatches.js";
import { execAsyncQuiet } from "./exec.js";
import { patchPySdkHooks } from "./patchPySdkHooks.js";
import { patchPythonSdkGlobalDefaults } from "./patchPythonSdk.js";
import { patchTsSdkHooks } from "./patchTsSdkHooks.js";

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
	assertSdkPatches({ sdkDir: speakeasySdkDir, label: "TS" });

	await execAsyncQuiet({
		command: "bun",
		args: ["run", "build"],
		cwd: speakeasySdkDir,
		label: "TypeScript SDK build",
	});
}

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
	assertSdkPatches({ sdkDir: pythonSdkDir, label: "PY" });
}

export async function generateSdksInParallel({
	speakeasySdkDir,
	pythonSdkDir,
}: {
	speakeasySdkDir: string;
	pythonSdkDir: string;
}): Promise<void> {
	console.log("Generating TypeScript and Python SDKs...");

	try {
		await generateTypeScriptSdkQuiet({ speakeasySdkDir });
		console.log("✓ TypeScript SDK generated and built successfully");
	} catch (reason) {
		console.error("✗ TypeScript SDK generation failed:", reason);
		throw new Error("SDK generation failed");
	}

	if (process.env.SKIP_PYTHON_SDK === "1") {
		console.log("⤳ Skipping Python SDK generation (SKIP_PYTHON_SDK=1)");
		return;
	}

	try {
		await generatePythonSdkQuiet({ speakeasySdkDir, pythonSdkDir });
		console.log("✓ Python SDK generated and patched successfully");
	} catch (reason) {
		console.error("✗ Python SDK generation failed:", reason);
		throw new Error("SDK generation failed");
	}
}
