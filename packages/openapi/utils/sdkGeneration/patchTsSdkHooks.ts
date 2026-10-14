import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

	content = content.replace(
		'import { RequestInput } from "../lib/http.js";',
		'import { RequestInput } from "../lib/http.js";\nimport { initHooks } from "./registration.js";',
	);

	content = content.replace(
		"constructor() {\n    const presetHooks",
		"constructor() {\n    initHooks(this);\n\n    const presetHooks",
	);

	writeFileSync(hooksPath, content);
	console.log("[TS] TypeScript SDK hooks patched successfully");
}
