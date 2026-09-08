import { announceAuthorizationUrl } from "../auth/announceAuthorizationUrl";
import { openSystemBrowser } from "../auth/browser/openSystemBrowser";
import { createOrgApiKeys } from "../auth/createOrgApiKeys";
import { CLI_OAUTH_SCOPES } from "../auth/oauthConfig";
import {
	type AuthorizationUrlListener,
	runOAuthFlow,
} from "../auth/runOAuthFlow";
import type { BrowserOpener } from "../auth/types/browserOpener";
import type { OAuthTokens } from "../auth/types/oauthTokens";
import type { OrgApiKeys } from "../auth/types/orgApiKeys";
import { loadEnvFiles, writeEnvValues } from "../env/loadEnv";
import {
	resolveTarget,
	type Target,
	targetBaseUrl,
} from "../env/resolveTarget";
import { configSearchDirs } from "./push";

export type Authorize = ({
	onAuthorizationUrl,
}: {
	onAuthorizationUrl: AuthorizationUrlListener;
}) => Promise<OAuthTokens>;

export type CreateApiKeys = ({
	accessToken,
}: {
	accessToken: string;
}) => Promise<OrgApiKeys>;

export type LoginOptions = {
	cwd?: string;
	/** Where to write progress. Injected so tests can capture it. */
	write?: (text: string) => void;
	openBrowser?: BrowserOpener;
	/** Resolved by the CLI from its global flags; defaults to the env-driven target. */
	target?: Target;
	authorize?: Authorize;
	createApiKeys?: CreateApiKeys;
};

export type LoginResult = {
	envPath: string;
	orgId?: string;
	writtenKeys: string[];
};

const authorizeWith =
	({ target }: { target: Target }): Authorize =>
	({ onAuthorizationUrl }) =>
		runOAuthFlow({
			clientId: target.clientId,
			backendUrl: targetBaseUrl({ target }),
			scopes: CLI_OAUTH_SCOPES,
			onAuthorizationUrl,
		});

const createApiKeysWith =
	({ target }: { target: Target }): CreateApiKeys =>
	({ accessToken }) =>
		createOrgApiKeys({ accessToken, backendUrl: targetBaseUrl({ target }) });

const keysToEnvValues = ({
	keys,
}: {
	keys: OrgApiKeys;
}): Record<string, string> => {
	const values: Record<string, string> = {};
	if (keys.sandboxKey) values.AUTUMN_SECRET_KEY = keys.sandboxKey;
	if (keys.prodKey) values.AUTUMN_PROD_SECRET_KEY = keys.prodKey;
	return values;
};

/**
 * Authorize in a browser — or on any other machine — then mint the org's keys
 * and put them where `loadEnvFiles` will find them again.
 */
export const runLogin = async ({
	cwd = process.cwd(),
	target,
	write = (text) => process.stdout.write(text),
	openBrowser = openSystemBrowser,
	authorize,
	createApiKeys,
}: LoginOptions = {}): Promise<LoginResult> => {
	const dirs = configSearchDirs({ cwd });
	loadEnvFiles({ dirs });
	// The same target every other command resolves: a local server or a
	// staging URL authenticates against itself, never against production.
	const resolved = target ?? resolveTarget({});
	const authorizeStep = authorize ?? authorizeWith({ target: resolved });
	const createApiKeysStep =
		createApiKeys ?? createApiKeysWith({ target: resolved });

	const tokens = await authorizeStep({
		onAuthorizationUrl: ({ url }) =>
			announceAuthorizationUrl({ url, write, openBrowser }),
	});

	const keys = await createApiKeysStep({ accessToken: tokens.accessToken });
	const values = keysToEnvValues({ keys });

	if (Object.keys(values).length === 0) {
		throw new Error("Authorization succeeded but no API keys were returned.");
	}

	const envPath = writeEnvValues({ dirs, values });
	const writtenKeys = Object.keys(values);

	write(`\nWrote ${writtenKeys.join(" and ")} to ${envPath}\n`);

	return { envPath, orgId: keys.orgId, writtenKeys };
};
