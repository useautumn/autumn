import { ALIEN_HOSTED_API_URL } from "./alienConstants.js";
import {
	deleteDeployment,
	findDeployment,
	updateDeploymentCompute,
} from "./deployments/deployments.js";
import { revokeSetupLinks } from "./setup/setupLinks.js";
import { startSetup } from "./setup/startSetup.js";
import type { AlienApi } from "./types/alienApi.js";
import type { AlienClient, AlienConfig } from "./types/alienClient.js";

const configToApi = ({ config }: { config: AlienConfig }): AlienApi => {
	if (config.kind === "local")
		return { config, baseUrl: config.baseUrl, apiKey: null };
	return { config, baseUrl: ALIEN_HOSTED_API_URL, apiKey: config.apiKey };
};

/** One manager behind named methods; which manager, and its key, are the caller's to read. */
export const createAlienClient = ({
	config,
}: {
	config: AlienConfig;
}): AlienClient => {
	const ctx = { api: configToApi({ config }) };
	return {
		startSetup: (params) => startSetup({ ctx, ...params }),
		findDeployment: (params) => findDeployment({ ctx, ...params }),
		updateDeploymentCompute: (params) =>
			updateDeploymentCompute({ ctx, ...params }),
		deleteDeployment: (params) => deleteDeployment({ ctx, ...params }),
		revokeSetupLinks: (params) => revokeSetupLinks({ ctx, ...params }),
	};
};
