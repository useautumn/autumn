import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Patches the Python SDK hooks to call init_hooks and import registration.
 *
 * Speakeasy regenerates sdkhooks.py without calling init_hooks, so custom
 * hooks (FailOpenHook, TimeoutHook) are never registered. This patch adds
 * the import and constructor call.
 */
export function patchPySdkHooks({
	pythonSdkDir,
}: {
	pythonSdkDir: string;
}): void {
	console.log("[PY] Patching Python SDK hooks...");

	const hooksPath = path.join(
		pythonSdkDir,
		"src/autumn_sdk/_hooks/sdkhooks.py",
	);
	let content = readFileSync(hooksPath, "utf-8");

	if (content.includes("init_hooks")) {
		console.log("[PY] sdkhooks.py already patched, skipping");
		return;
	}

	// Add import for init_hooks from registration
	content = content.replace(
		"import httpx\nfrom .types import (",
		"import httpx\nfrom .registration import init_hooks\nfrom .types import (",
	);

	// Add init_hooks(self) at the end of __init__
	content = content.replace(
		"self.after_error_hooks: List[AfterErrorHook] = []",
		"self.after_error_hooks: List[AfterErrorHook] = []\n        init_hooks(self)",
	);

	writeFileSync(hooksPath, content);
	console.log("[PY] Python SDK hooks patched successfully");
}
