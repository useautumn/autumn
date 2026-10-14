import {
	ALIEN_WORKSPACE,
	type AlienClient,
	type AlienConfig,
	createAlienClient,
} from "@autumn/alien";
import { logger } from "@/external/logtail/logtailUtils.js";
import { alienErrorToByocUnavailable } from "./alienErrorToByocUnavailable.js";

let alienClient: AlienClient | null | undefined;

const envToAlienConfig = (): AlienConfig | null => {
	const { ALIEN_API_KEY, ALIEN_PROJECT, ALIEN_MANAGER_URL } = process.env;
	if (ALIEN_API_KEY) {
		if (!ALIEN_PROJECT)
			throw new Error("ALIEN_PROJECT is required when ALIEN_API_KEY is set");
		return {
			kind: "hosted",
			apiKey: ALIEN_API_KEY,
			project: ALIEN_PROJECT,
			workspace: ALIEN_WORKSPACE,
		};
	}
	if (ALIEN_MANAGER_URL) return { kind: "local", baseUrl: ALIEN_MANAGER_URL };
	return null;
};

const withByocErrors =
	<Params, Result>(call: (params: Params) => Promise<Result>) =>
	async (params: Params): Promise<Result> => {
		try {
			return await call(params);
		} catch (error) {
			throw alienErrorToByocUnavailable({ error });
		}
	};

const createServerAlienClient = (): AlienClient | null => {
	const config = envToAlienConfig();
	if (!config) return null;
	const client = createAlienClient({ config, logger });
	return {
		startSetup: withByocErrors(client.startSetup),
		findDeploymentGroup: withByocErrors(client.findDeploymentGroup),
		findDeployment: withByocErrors(client.findDeployment),
		getDeployment: withByocErrors(client.getDeployment),
		retryDeployment: withByocErrors(client.retryDeployment),
		updateDeploymentCompute: withByocErrors(client.updateDeploymentCompute),
		deleteDeployment: withByocErrors(client.deleteDeployment),
		revokeSetupLinksOnceDeleted: withByocErrors(
			client.revokeSetupLinksOnceDeleted,
		),
	};
};

export const getAlienClient = (): AlienClient | null => {
	if (alienClient === undefined) alienClient = createServerAlienClient();
	return alienClient;
};
