const DEFAULT_BACKEND_URL = "https://api.useautumn.com";

/**
 * The registered Better Auth client for the atmn CLI, carried over from v2 so
 * existing consent records keep working.
 */
const CLI_CLIENT_ID = "hAWUopQqLnsSwuRgeRzIBzKslwXmQUSr";

const OAUTH_PORT_BASE = 31448;
const OAUTH_PORT_RANGE = 5;

/** Callback ports tried in order; every one is registered as a redirect URI. */
export const OAUTH_PORTS = Array.from(
	{ length: OAUTH_PORT_RANGE },
	(_, offset) => OAUTH_PORT_BASE + offset,
);

/**
 * Modern read/write scopes covering everything the CLI reads and everything the
 * minted keys are used for. The server rewrites v2's CRUDL scopes to these.
 */
export const CLI_OAUTH_SCOPES = [
	"organisation:read",
	"customers:read",
	"customers:write",
	"features:read",
	"features:write",
	"plans:read",
	"plans:write",
	"rewards:read",
	"rewards:write",
	"apiKeys:read",
	"apiKeys:write",
] as const;

export const getBackendUrl = (): string =>
	process.env.ATMN_BACKEND_URL ?? DEFAULT_BACKEND_URL;

export const getCliClientId = (): string =>
	process.env.ATMN_CLI_CLIENT_ID ?? CLI_CLIENT_ID;

export const getOAuthRedirectUri = ({ port }: { port: number }): string =>
	`http://localhost:${port}/`;

export const getAuthorizationEndpoint = ({
	backendUrl,
}: {
	backendUrl: string;
}): string => `${backendUrl}/api/auth/oauth2/authorize`;

export const getTokenEndpoint = ({
	backendUrl,
}: {
	backendUrl: string;
}): string => `${backendUrl}/api/auth/oauth2/token`;

export const getApiKeysEndpoint = ({
	backendUrl,
}: {
	backendUrl: string;
}): string => `${backendUrl}/cli/api-keys`;
