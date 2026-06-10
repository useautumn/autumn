import {
	CodeChallengeMethod,
	generateCodeVerifier,
	OAuth2Client,
} from "arctic";

const RC_AUTHORIZE_URL = "https://api.revenuecat.com/oauth2/authorize";
const RC_TOKEN_URL = "https://api.revenuecat.com/oauth2/token";

export const RC_OAUTH_SCOPES = [
	"project_configuration:projects:read_write",
	"project_configuration:apps:read_write",
	"project_configuration:entitlements:read_write",
	"project_configuration:offerings:read_write",
	"project_configuration:packages:read_write",
	"project_configuration:products:read_write",
	"project_configuration:integrations:read_write",
	"project_configuration:virtual_currencies:read_write",
	"customer_information:customers:read_write",
	"customer_information:subscriptions:read_write",
	"customer_information:purchases:read_write",
	"customer_information:invoices:read",
	"charts_metrics:overview:read",
	"charts_metrics:charts:read",
];

const parseScope = (scope: string) => {
	const [domain, resource, access] = scope.split(":");
	return { domain, resource, access };
};

// RevenueCat collapses broad grants into wildcards (e.g. "*:*:read_write");
// read_write also satisfies a read requirement.
const grantSatisfies = (granted: string, required: string): boolean => {
	const g = parseScope(granted);
	const r = parseScope(required);
	const domainOk = g.domain === "*" || g.domain === r.domain;
	const resourceOk = g.resource === "*" || g.resource === r.resource;
	const accessOk = g.access === "read_write" || g.access === r.access;
	return domainOk && resourceOk && accessOk;
};

export const findMissingRcScopes = (grantedScopes: string[]): string[] => {
	return RC_OAUTH_SCOPES.filter(
		(required) =>
			!grantedScopes.some((granted) => grantSatisfies(granted, required)),
	);
};

const getRcOAuthClient = () => {
	const clientId = process.env.REVENUECAT_OAUTH_CLIENT_ID;
	const clientSecret = process.env.REVENUECAT_OAUTH_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error("RevenueCat OAuth client credentials not configured");
	}

	return new OAuth2Client(clientId, clientSecret, getRcOAuthRedirectUri());
};

export const getRcOAuthRedirectUri = () => {
	let serverUrl = process.env.BETTER_AUTH_URL;

	if (process.env.NGROK_URL) {
		serverUrl = process.env.NGROK_URL;
	}

	return `${(serverUrl ?? "").replace(/\/+$/, "")}/revenuecat/oauth_callback`;
};

export const createRcAuthorizationUrl = ({
	state,
	codeVerifier,
	scopes = RC_OAUTH_SCOPES,
}: {
	state: string;
	codeVerifier: string;
	scopes?: string[];
}) => {
	const client = getRcOAuthClient();
	return client.createAuthorizationURLWithPKCE(
		RC_AUTHORIZE_URL,
		state,
		CodeChallengeMethod.S256,
		codeVerifier,
		scopes,
	);
};

export const exchangeRcCode = async ({
	code,
	codeVerifier,
}: {
	code: string;
	codeVerifier: string;
}) => {
	const client = getRcOAuthClient();
	return client.validateAuthorizationCode(RC_TOKEN_URL, code, codeVerifier);
};

export const refreshRcTokens = async ({
	refreshToken,
	// Omit scopes on refresh — re-requesting the full set triggers RC `invalid_scope`.
	// An empty list reuses the originally-granted scopes (OAuth2 §6).
	scopes = [],
}: {
	refreshToken: string;
	scopes?: string[];
}) => {
	const client = getRcOAuthClient();
	return client.refreshAccessToken(RC_TOKEN_URL, refreshToken, scopes);
};

export { generateCodeVerifier };
