import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Patches the Python SDK to fix Speakeasy bug with global defaults.
 *
 * The bug: `get_global_from_env` returns `None` which overrides Pydantic default.
 * Fix: Only pass `x_api_version` to `Globals` if it's not `None`.
 */
export function patchPythonSdkGlobalDefaults({
	pythonSdkDir,
}: {
	pythonSdkDir: string;
}): void {
	console.log("[PY] Patching Python SDK for global defaults bug...");

	const sdkPyPath = path.join(pythonSdkDir, "src/autumn_sdk/sdk.py");
	const content = readFileSync(sdkPyPath, "utf-8");

	// Match multiline pattern:
	// _globals = internal.Globals(
	//     x_api_version=utils.get_global_from_env(
	//         x_api_version, "X_API_VERSION", str
	//     ),
	// )
	const patched = content.replace(
		/_globals = internal\.Globals\(\s*x_api_version=utils\.get_global_from_env\(\s*x_api_version,\s*"X_API_VERSION",\s*str\s*\),?\s*\)/g,
		`_x_api_version = utils.get_global_from_env(x_api_version, "X_API_VERSION", str)
        _globals = internal.Globals() if _x_api_version is None else internal.Globals(x_api_version=_x_api_version)`,
	);

	if (patched !== content) {
		writeFileSync(sdkPyPath, patched);
		console.log("[PY] Python SDK patched successfully");
	} else {
		console.log(
			"[PY] Warning: Python SDK patch pattern not found, may already be patched or format changed",
		);
	}
}

export function patchPythonSdkRewardAliases({
	pythonSdkDir,
}: {
	pythonSdkDir: string;
}): void {
	const modelsPath = path.join(
		pythonSdkDir,
		"src/autumn_sdk/models/__init__.py",
	);
	const content = readFileSync(modelsPath, "utf-8");
	const base = content
		.replace(
			/_COMPAT_MODEL_ALIASES = \{[\s\S]*?\n__all__ \+= _COMPAT_MODEL_ALIASES\n*/g,
			"",
		)
		.replace(
			"        _COMPAT_MODEL_ALIASES.get(attr_name, attr_name),",
			"        attr_name,",
		);
	const aliases = {
		CouponPromoCode: "ListRewardsCouponPromoCode",
		CouponPromoCodeTypedDict: "ListRewardsCouponPromoCodeTypedDict",
		CouponType: "ListRewardsCouponType",
		DurationType: "ListRewardsDurationType",
		Expiry: "ListRewardsExpiry",
		ExpiryType: "ListRewardsExpiryType",
		ExpiryTypedDict: "ListRewardsExpiryTypedDict",
		FeatureGrantPromoCode: "ListRewardsFeatureGrantPromoCode",
		FeatureGrantPromoCodeTypedDict: "ListRewardsFeatureGrantPromoCodeTypedDict",
		Grant: "ListRewardsGrant",
		GrantTypedDict: "ListRewardsGrantTypedDict",
	};
	const pythonAliases = `{
${Object.entries(aliases)
	.map(([name, target]) => `    "${name}": "${target}",`)
	.join("\n")}
}`;
	const patched = base
		.replace(
			"\ndef __getattr__(attr_name: str) -> Any:",
			`\n_COMPAT_MODEL_ALIASES = ${pythonAliases}\n__all__ += _COMPAT_MODEL_ALIASES\n\n\ndef __getattr__(attr_name: str) -> Any:`,
		)
		.replace(
			"        attr_name,\n        package=__package__,",
			"        _COMPAT_MODEL_ALIASES.get(attr_name, attr_name),\n        package=__package__,",
		);
	if (patched === base) throw new Error("Failed to add Python model aliases");
	writeFileSync(modelsPath, patched);
}
