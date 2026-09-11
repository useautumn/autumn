import { announceAuthorizationUrl } from "../auth/announceAuthorizationUrl";
import { openSystemBrowser } from "../auth/browser/openSystemBrowser";
import { createOrgApiKeys } from "../auth/createOrgApiKeys";
import { CLI_OAUTH_SCOPES } from "../auth/oauthConfig";
import {
	type AuthorizationUrlListener,
	runOAuthFlow,
} from "../auth/runOAuthFlow";
import type { BrowserOpener } from "../auth/types/browserOpener";
import type { ImpersonationTokens } from "../auth/types/impersonationTokens";
import type { AuthorizationOutcome } from "../auth/types/oauthTokens";
import type { OrgApiKeys } from "../auth/types/orgApiKeys";
import { loadEnvFiles, writeEnvValues } from "../env/loadEnv";
import {
	resolveTarget,
	type Target,
	targetBaseUrl,
} from "../env/resolveTarget";
import { resolveProject } from "../project/resolveProject";

export type Authorize = ({
	onAuthorizationUrl,
}: {
	onAuthorizationUrl: AuthorizationUrlListener;
}) => Promise<AuthorizationOutcome>;

export type CreateApiKeys = ({
	accessToken,
}: {
	accessToken: string;
}) => Promise<OrgApiKeys>;

export type LoginOptions = {
	cwd?: string;
	configPath?: string;
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

/** Same env names as api keys: every command already sends them as a bearer. */
const impersonationToEnvValues = ({
	tokens,
}: {
	tokens: ImpersonationTokens;
}): Record<string, string> => ({
	AUTUMN_SECRET_KEY: tokens.sandboxToken,
	AUTUMN_PROD_SECRET_KEY: tokens.liveToken,
});

const formatExpiry = (iso: string): string => {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
};

/**
 * Authorize in a browser — or on any other machine — then mint the org's keys
 * and put them where `loadEnvFiles` will find them again.
 */
export const runLogin = async ({
	cwd = process.cwd(),
	configPath,
	target,
	write = (text) => process.stdout.write(text),
	openBrowser = openSystemBrowser,
	authorize,
	createApiKeys,
}: LoginOptions = {}): Promise<LoginResult> => {
	const dirs = resolveProject({ cwd, configFlag: configPath }).envDirs;
	loadEnvFiles({ dirs });
	// The same target every other command resolves: a local server or a
	// staging URL authenticates against itself, never against production.
	const resolved = target ?? resolveTarget({});
	const authorizeStep = authorize ?? authorizeWith({ target: resolved });
	const createApiKeysStep =
		createApiKeys ?? createApiKeysWith({ target: resolved });

	const outcome = await authorizeStep({
		onAuthorizationUrl: ({ url }) =>
			announceAuthorizationUrl({ url, write, openBrowser }),
	});

	// Impersonating a customer: one-hour tokens, no api keys minted on their org.
	if (outcome.kind === "impersonation") {
		const values = impersonationToEnvValues({ tokens: outcome.tokens });
		const envPath = writeEnvValues({ dirs, values });
		write(
			`\nWrote impersonation tokens to ${envPath}. They expire at ${formatExpiry(outcome.tokens.expiresAt)}; run \`atmn login\` again after that.\n`,
		);
		return { envPath, writtenKeys: Object.keys(values) };
	}

	const keys = await createApiKeysStep({
		accessToken: outcome.tokens.accessToken,
	});
	const values = keysToEnvValues({ keys });

	if (Object.keys(values).length === 0) {
		throw new Error("Authorization succeeded but no API keys were returned.");
	}

	const envPath = writeEnvValues({ dirs, values });
	const writtenKeys = Object.keys(values);

	write(`\nWrote ${writtenKeys.join(" and ")} to ${envPath}\n`);

	return { envPath, orgId: keys.orgId, writtenKeys };
};
