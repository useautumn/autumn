import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Patches the TypeScript SDK hooks to call initHooks and import registration.
 *
 * Speakeasy regenerates hooks.ts with an empty presetHooks array and no
 * call to initHooks, so custom hooks (FailOpenHook, TimeoutFixHook) are
 * never registered. This patch adds the import and constructor call.
 */
export function patchTsSdkHooks({
	speakeasySdkDir,
}: {
	speakeasySdkDir: string;
}): void {
	console.log("[TS] Patching TypeScript SDK hooks...");

	const hooksPath = path.join(speakeasySdkDir, "src/hooks/hooks.ts");
	let content = readFileSync(hooksPath, "utf-8");

	if (content.includes("initHooks")) {
		console.log("[TS] hooks.ts already patched, skipping");
		return;
	}

	// Add import for initHooks from registration
	content = content.replace(
		'import { RequestInput } from "../lib/http.js";',
		'import { RequestInput } from "../lib/http.js";\nimport { initHooks } from "./registration.js";',
	);

	// Add initHooks(this) at the start of the constructor body
	content = content.replace(
		"constructor() {\n    const presetHooks",
		"constructor() {\n    initHooks(this);\n\n    const presetHooks",
	);

	writeFileSync(hooksPath, content);
	console.log("[TS] TypeScript SDK hooks patched successfully");
}
