import { dirname } from "node:path";
import { withAuthRecovery } from "../../lib/auth/headlessAuthRecovery.js";
import { AppEnv, getKey, hasKey } from "../../lib/env/index.js";
import { mergeEnvironments } from "./mergeEnvironments.js";
import { pullFromEnvironment } from "./pullFromEnvironment.js";
import { generateSdkTypes } from "./sdkTypes.js";
import type { PullOptions, PullResult } from "./types.js";
import { writeConfig } from "./writeConfig.js";

/**
 * Pull command - fetch config from Autumn API and generate local files
 *
 * Flow:
 * 1. Get key for specified environment (defaults to sandbox)
 * 2. Fetch & transform from specified environment
 * 3. Write autumn.config.ts (in-place if exists, unless forceOverwrite)
 * 4. If generateSdkTypes:
 *    a. Try get live key (optional)
 *    b. If live key exists, fetch & transform from live
 *    c. Merge sandbox + live (dedupe by ID)
 *    d. Generate @useautumn-sdk.d.ts
 *
 * Automatically handles 401 errors by running OAuth flow and retrying.
 */
export async function pull(options: PullOptions = {}): Promise<PullResult> {
	// Wrap the entire pull operation with auth recovery
	return withAuthRecovery(async () => {
		return await _pullImpl(options);
	});
}

/**
 * Internal implementation of pull
 */
async function _pullImpl(options: PullOptions = {}): Promise<PullResult> {
	const {
		generateSdkTypes: shouldGenerateSdkTypes = false,
		cwd = process.cwd(),
		environment = AppEnv.Sandbox,
		forceOverwrite = false,
		noDeclarationFile = false,
	} = options;

	// 1. Get key for specified environment (checks cwd then falls back to root)
	const primaryKey = getKey(environment, cwd);

	// 2. Fetch & transform from specified environment
	const primaryData = await pullFromEnvironment(primaryKey);

	// 3. Write autumn.config.ts (in-place update if exists, unless forceOverwrite)
	const writeResult = await writeConfig(
		primaryData.features,
		primaryData.plans,
		cwd,
		{ forceOverwrite },
	);

	const result: PullResult = {
		features: primaryData.features,
		plans: primaryData.plans,
		configPath: writeResult.configPath,
		inPlace: writeResult.inPlace,
		updateResult: writeResult.updateResult,
	};

	// 4. Generate SDK types if requested (and not disabled)
	if (shouldGenerateSdkTypes && !noDeclarationFile) {
		let mergedData = primaryData;

		// If pulling from sandbox, try to merge with live for SDK types
		if (environment === AppEnv.Sandbox && hasKey(AppEnv.Live, cwd)) {
			try {
				const liveKey = getKey(AppEnv.Live, cwd);
				const liveData = await pullFromEnvironment(liveKey);

				// Merge sandbox and live
				mergedData = mergeEnvironments(primaryData, liveData);
			} catch (error) {
				console.warn("Failed to fetch live data, using sandbox only:", error);
			}
		}
		// If pulling from live, try to merge with sandbox for SDK types
		else if (environment === AppEnv.Live && hasKey(AppEnv.Sandbox, cwd)) {
			try {
				const sandboxKey = getKey(AppEnv.Sandbox, cwd);
				const sandboxData = await pullFromEnvironment(sandboxKey);

				// Merge live and sandbox
				mergedData = mergeEnvironments(sandboxData, primaryData);
			} catch (error) {
				console.warn("Failed to fetch sandbox data, using live only:", error);
			}
		}

		// Generate SDK types in the same directory as the config file
		const sdkTypesPath = await generateSdkTypes({
			features: mergedData.features,
			plans: mergedData.plans,
			outputDir: dirname(writeResult.configPath),
		});

		result.sdkTypesPath = sdkTypesPath;
	}

	return result;
}
