import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Patches the Python SDK to fix a Speakeasy bug with global defaults.
 *
 * The bug: `get_global_from_env` returns `None` when neither the argument nor
 * the env var is set, and passing that explicit `None` to `Globals(...)`
 * overrides the Pydantic default (e.g. `x_api_version = "2.4.0"`), so the
 * `x-api-version` header is never sent.
 *
 * Fix: only pass globals to `Globals` when they resolve to a non-`None` value.
 */
const GLOBALS_CONSTRUCTION_PATTERN =
	/_globals = internal\.Globals\(\n(?<body>(?:[ \t]+\w+=utils\.get_global_from_env\([\s\S]*?\),\n)+)[ \t]+\)/;

const GLOBAL_KWARG_PATTERN =
	/[ \t]+(?<name>\w+)=utils\.get_global_from_env\(\s*(?<args>[\s\S]*?)\s*\),\n/g;

export function patchPythonSdkGlobalDefaults({
	pythonSdkDir,
}: {
	pythonSdkDir: string;
}): void {
	console.log("[PY] Patching Python SDK for global defaults bug...");

	const sdkPyPath = path.join(pythonSdkDir, "src/autumn_sdk/sdk.py");
	const content = readFileSync(sdkPyPath, "utf-8");

	const match = content.match(GLOBALS_CONSTRUCTION_PATTERN);
	if (!match?.groups) {
		throw new Error(
			"[PY] Python SDK global defaults patch pattern not found in sdk.py. Speakeasy output format may have changed; update patchPythonSdk.ts.",
		);
	}

	const globalNames: string[] = [];
	const resolvedLines: string[] = [];
	for (const kwarg of match.groups.body.matchAll(GLOBAL_KWARG_PATTERN)) {
		const name = kwarg.groups?.name;
		const args = kwarg.groups?.args.replace(/\s+/g, " ");
		if (!name || !args) continue;
		globalNames.push(name);
		resolvedLines.push(`_${name} = utils.get_global_from_env(${args})`);
	}

	if (globalNames.length === 0) {
		throw new Error(
			"[PY] Python SDK global defaults patch found no globals to patch in sdk.py.",
		);
	}

	const indent = "        ";
	const dictEntries = globalNames
		.map((name) => `"${name}": _${name}`)
		.join(", ");
	const replacement = [
		...resolvedLines,
		`_resolved_globals = {${dictEntries}}`,
		"_globals = internal.Globals(",
		"    **{key: value for key, value in _resolved_globals.items() if value is not None}",
		")",
	]
		.map((line, index) => (index === 0 ? line : `${indent}${line}`))
		.join("\n");

	const patched = content.replace(GLOBALS_CONSTRUCTION_PATTERN, replacement);
	writeFileSync(sdkPyPath, patched);
	console.log(
		`[PY] Python SDK patched successfully (globals: ${globalNames.join(", ")})`,
	);
}
