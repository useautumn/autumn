import { announceAuthorizationUrl } from "../auth/announceAuthorizationUrl";
import { openSystemBrowser } from "../auth/browser/openSystemBrowser";
import { createOrgApiKeys } from "../auth/createOrgApiKeys";
import {
	CLI_OAUTH_SCOPES,
	getBackendUrl,
	getCliClientId,
} from "../auth/oauthConfig";
import {
	type AuthorizationUrlListener,
	runOAuthFlow,
} from "../auth/runOAuthFlow";
import type { BrowserOpener } from "../auth/types/browserOpener";
import type { OAuthTokens } from "../auth/types/oauthTokens";
import type { OrgApiKeys } from "../auth/types/orgApiKeys";
import { loadEnvFiles, writeEnvValues } from "../env/loadEnv";
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
	authorize?: Authorize;
	createApiKeys?: CreateApiKeys;
};

export type LoginResult = {
	envPath: string;
	orgId?: string;
	writtenKeys: string[];
};

const authorizeWithAutumn: Authorize = ({ onAuthorizationUrl }) =>
	runOAuthFlow({
		clientId: getCliClientId(),
		backendUrl: getBackendUrl(),
		scopes: CLI_OAUTH_SCOPES,
		onAuthorizationUrl,
	});

const createAutumnApiKeys: CreateApiKeys = ({ accessToken }) =>
	createOrgApiKeys({ accessToken, backendUrl: getBackendUrl() });

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
	write = (text) => process.stdout.write(text),
	openBrowser = openSystemBrowser,
	authorize = authorizeWithAutumn,
	createApiKeys = createAutumnApiKeys,
}: LoginOptions = {}): Promise<LoginResult> => {
	const dirs = configSearchDirs({ cwd });
	loadEnvFiles({ dirs });

	const tokens = await authorize({
		onAuthorizationUrl: ({ url }) =>
			announceAuthorizationUrl({ url, write, openBrowser }),
	});

	const keys = await createApiKeys({ accessToken: tokens.accessToken });
	const values = keysToEnvValues({ keys });

	if (Object.keys(values).length === 0) {
		throw new Error("Authorization succeeded but no API keys were returned.");
	}

	const envPath = writeEnvValues({ dirs, values });
	const writtenKeys = Object.keys(values);

	write(`\nWrote ${writtenKeys.join(" and ")} to ${envPath}\n`);

	return { envPath, orgId: keys.orgId, writtenKeys };
};
