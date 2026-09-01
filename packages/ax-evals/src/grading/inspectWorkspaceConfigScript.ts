import {
	formatValidationErrors,
	validateConfig,
} from "../../../atmn/src/commands/push/validate.ts";
import { loadConfig } from "../../../atmn/src/lib/config/loadConfig.ts";
import { transformPlanToApi } from "../../../atmn/src/lib/transforms/sdkToApi/plan.ts";
import type { InspectedConfig } from "./types/inspectedConfig.ts";

/**
 * Bun entrypoint: `bun inspectWorkspaceConfigScript.ts <workspaceDir>`.
 * Runs out-of-process so atmn internals (jiti, import.meta) never enter the
 * braintrust CLI's CJS eval bundle. Prints InspectedConfig as JSON.
 */
const inspect = async (workspaceDir: string): Promise<InspectedConfig> => {
	try {
		const config = await loadConfig({ cwd: workspaceDir });
		const validation = validateConfig(config.features, config.plans);
		return {
			configFound: true,
			validationErrors: validation.valid
				? undefined
				: formatValidationErrors(validation.errors).split("\n"),
			plans: config.plans.map((plan) => transformPlanToApi(plan)),
			features: config.features.map((feature) => ({
				id: feature.id,
				type: feature.type,
			})),
		};
	} catch (error) {
		return {
			configFound: true,
			plans: [],
			features: [],
			parseError: error instanceof Error ? error.message : String(error),
		};
	}
};

const workspaceDir = process.argv[2];
if (!workspaceDir) throw new Error("usage: inspectWorkspaceConfigScript <dir>");
console.log(JSON.stringify(await inspect(workspaceDir)));
