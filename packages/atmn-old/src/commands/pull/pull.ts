import { dirname } from "node:path";
import { withAuthRecovery } from "../../lib/auth/headlessAuthRecovery.js";
import { AppEnv, getKey, hasKey } from "../../lib/env/index.js";
import { mergeEnvironments } from "./mergeEnvironments.js";
import { pullFromEnvironment } from "./pullFromEnvironment.js";
import { generateSdkTypes } from "./sdkTypes.js";
import type { PullOptions, PullResult } from "./types.js";
import { writeConfig } from "./writeConfig.js";

export async function pull(options: PullOptions = {}): Promise<PullResult> {
	return withAuthRecovery(async () => {
		return await _pullImpl(options);
	});
}

async function _pullImpl(options: PullOptions = {}): Promise<PullResult> {
	const {
		generateSdkTypes: shouldGenerateSdkTypes = false,
		cwd = process.cwd(),
		environment = AppEnv.Sandbox,
		forceOverwrite = false,
		noDeclarationFile = false,
		allVersions = false,
	} = options;

	const primaryKey = getKey(environment, cwd);

	const primaryData = await pullFromEnvironment(primaryKey, { allVersions });

	const writeResult = await writeConfig({
		features: primaryData.features,
		plans: primaryData.plans,
		cwd,
		forceOverwrite: forceOverwrite || allVersions,
		rewards: primaryData.rewards,
		referralPrograms: primaryData.referralPrograms,
	});

	const result: PullResult = {
		features: primaryData.features,
		plans: primaryData.plans,
		rewards: primaryData.rewards,
		referralPrograms: primaryData.referralPrograms,
		configPath: writeResult.configPath,
		inPlace: writeResult.inPlace,
		updateResult: writeResult.updateResult,
	};

	if (shouldGenerateSdkTypes && !noDeclarationFile) {
		let mergedData = primaryData;

		if (environment === AppEnv.Sandbox && hasKey(AppEnv.Live, cwd)) {
			try {
				const liveKey = getKey(AppEnv.Live, cwd);
				const liveData = await pullFromEnvironment(liveKey, { allVersions });

				mergedData = mergeEnvironments({
					sandbox: primaryData,
					production: liveData,
				});
			} catch (error) {
				console.warn("Failed to fetch live data, using sandbox only:", error);
			}
		}
		else if (environment === AppEnv.Live && hasKey(AppEnv.Sandbox, cwd)) {
			try {
				const sandboxKey = getKey(AppEnv.Sandbox, cwd);
				const sandboxData = await pullFromEnvironment(sandboxKey, {
					allVersions,
				});

				mergedData = mergeEnvironments({
					sandbox: sandboxData,
					production: primaryData,
				});
			} catch (error) {
				console.warn("Failed to fetch sandbox data, using live only:", error);
			}
		}

		const sdkTypesPath = await generateSdkTypes({
			features: mergedData.features,
			plans: mergedData.plans,
			outputDir: dirname(writeResult.configPath),
		});

		result.sdkTypesPath = sdkTypesPath;
	}

	return result;
}
