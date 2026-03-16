import { existsSync, writeFileSync } from "node:fs";
import prettier from "prettier";
import type { Feature, Plan } from "../../compose/models/index.js";
import { resolveConfigPath } from "../../lib/env/index.js";
import { buildConfigFile } from "../../lib/transforms/index.js";
import {
	type UpdateResult,
	updateConfigInPlace,
} from "../../lib/transforms/inPlaceUpdate/index.js";

export interface WriteConfigOptions {
	/** Force overwrite even if config exists (default: false, will use in-place update) */
	forceOverwrite?: boolean;
}

export interface WriteConfigResult {
	configPath: string;
	/** Whether in-place update was used */
	inPlace: boolean;
	/** Details if in-place update was used */
	updateResult?: UpdateResult;
}

/**
 * Write autumn.config.ts file
 *
 * By default, if the config file already exists, it will be updated in-place
 * to preserve comments, order, and custom formatting.
 *
 * Use forceOverwrite: true to completely regenerate the file.
 */
export async function writeConfig(
	features: Feature[],
	plans: Plan[],
	cwd: string = process.cwd(),
	options: WriteConfigOptions = {},
): Promise<WriteConfigResult> {
	const configPath = resolveConfigPath(cwd);
	const configExists = existsSync(configPath);
	const { forceOverwrite = false } = options;

	// Use in-place update if config exists and not forcing overwrite
	if (configExists && !forceOverwrite) {
		try {
			const updateResult = await updateConfigInPlace(features, plans, cwd);
			return {
				configPath,
				inPlace: true,
				updateResult,
			};
		} catch (error) {
			// If in-place update fails, fall back to full regeneration
			console.warn("In-place update failed, regenerating config:", error);
		}
	}

	// Generate new config file
	const code = buildConfigFile(features, plans);

	// Format with prettier
	let formattedCode: string;
	try {
		formattedCode = await prettier.format(code, {
			parser: "typescript",
			useTabs: true,
			singleQuote: true,
		});
	} catch (error) {
		// If formatting fails, use unformatted code
		console.warn("Failed to format config file:", error);
		formattedCode = code;
	}

	// Write file
	writeFileSync(configPath, formattedCode, "utf-8");

	return {
		configPath,
		inPlace: false,
	};
}

/**
 * Legacy function signature for backwards compatibility
 */
export async function writeConfigLegacy(
	features: Feature[],
	plans: Plan[],
	cwd: string = process.cwd(),
): Promise<string> {
	const result = await writeConfig(features, plans, cwd);
	return result.configPath;
}
