import {
	ALIEN_WORKSPACE,
	type AlienClient,
	type AlienConfig,
	createAlienClient,
	isAlienRequestError,
} from "@autumn/alien";
import { ErrCode, RecaseError } from "@autumn/shared";

let alienClient: AlienClient | null | undefined;

/** Hosted alien when its key is set; a local `alien dev` manager only when its URL is given. */
const envToAlienConfig = (): AlienConfig | null => {
	const { ALIEN_API_KEY, ALIEN_PROJECT, ALIEN_MANAGER_URL } = process.env;
	if (ALIEN_API_KEY) {
		// Each environment has its own project; defaulting one would point staging at prod's deployments.
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

const toByocUnavailable = ({ error }: { error: unknown }) => {
	if (!isAlienRequestError(error)) return error;
	return new RecaseError({
		message: "Atom is unavailable right now. Try again shortly.",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
		data: { path: error.path, status: error.status, detail: error.detail },
	});
};

/** An unanswered or refused alien call reaches API callers as a 503, never a 500. */
const withByocErrors =
	<Params, Result>(call: (params: Params) => Promise<Result>) =>
	async (params: Params): Promise<Result> => {
		try {
			return await call(params);
		} catch (error) {
			throw toByocUnavailable({ error });
		}
	};

const createServerAlienClient = (): AlienClient | null => {
	const config = envToAlienConfig();
	if (!config) return null;
	const client = createAlienClient({ config });
	return {
		startSetup: withByocErrors(client.startSetup),
		findDeployment: withByocErrors(client.findDeployment),
		getDeployment: withByocErrors(client.getDeployment),
		retryDeployment: withByocErrors(client.retryDeployment),
		updateDeploymentCompute: withByocErrors(client.updateDeploymentCompute),
		deleteDeployment: withByocErrors(client.deleteDeployment),
		revokeSetupLinks: withByocErrors(client.revokeSetupLinks),
	};
};

/** The server's one client; null where no alien manager is configured. */
export const getAlienClient = (): AlienClient | null => {
	if (alienClient === undefined) alienClient = createServerAlienClient();
	return alienClient;
};
