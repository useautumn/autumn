import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

	if (content.includes("from .registration import init_hooks")) {
		console.log("[PY] sdkhooks.py already patched, skipping");
		return;
	}

	content = content.replace(
		"import httpx\nfrom .types import (",
		"import httpx\nfrom .registration import init_hooks\nfrom .types import (",
	);

	content = content.replace(
		"self.after_error_hooks: List[AfterErrorHook] = []",
		"self.after_error_hooks: List[AfterErrorHook] = []\n        init_hooks(self)",
	);

	if (!content.includes("init_hooks(self)"))
		throw new Error(
			"[PY] sdkhooks.py patch anchors not found; update patchPySdkHooks.ts.",
		);

	writeFileSync(hooksPath, content);
	console.log("[PY] Python SDK hooks patched successfully");
}
