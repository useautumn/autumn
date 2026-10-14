import { existsSync, writeFileSync } from "node:fs";
import prettier from "prettier";
import type { ReferralProgram, Reward } from "../../compose/index.js";
import type { Feature } from "../../compose/models/index.js";
import type { Plan } from "../../compose/models/variantModels.js";
import { resolveConfigPath } from "../../lib/env/index.js";
import { buildConfigFile } from "../../lib/transforms/index.js";
import {
	type UpdateResult,
	updateConfigInPlace,
} from "../../lib/transforms/inPlaceUpdate/index.js";

export interface WriteConfigParams {
	features: Feature[];
	plans: Plan[];
	cwd?: string;
	forceOverwrite?: boolean;
	rewards?: Reward[];
	referralPrograms?: ReferralProgram[];
}

export interface WriteConfigResult {
	configPath: string;
	inPlace: boolean;
	updateResult?: UpdateResult;
}

export async function writeConfig({
	features,
	plans,
	cwd = process.cwd(),
	forceOverwrite = false,
	rewards,
	referralPrograms,
}: WriteConfigParams): Promise<WriteConfigResult> {
	const configPath = resolveConfigPath(cwd);
	const configExists = existsSync(configPath);

	if (configExists && !forceOverwrite) {
		const updateResult = await updateConfigInPlace({
			features,
			plans,
			cwd,
			rewards,
			referralPrograms,
		});
		return {
			configPath,
			inPlace: true,
			updateResult,
		};
	}

	const code = buildConfigFile(
		features,
		plans,
		rewards ?? [],
		referralPrograms ?? [],
	);

	let formattedCode: string;
	try {
		formattedCode = await prettier.format(code, {
			parser: "typescript",
			useTabs: true,
			singleQuote: true,
		});
	} catch (error) {
		console.warn("Failed to format config file:", error);
		formattedCode = code;
	}

	writeFileSync(configPath, formattedCode, "utf-8");

	return {
		configPath,
		inPlace: false,
	};
}

export async function writeConfigLegacy(
	features: Feature[],
	plans: Plan[],
	cwd: string = process.cwd(),
): Promise<string> {
	const result = await writeConfig({ features, plans, cwd });
	return result.configPath;
}
