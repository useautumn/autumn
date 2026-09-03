import { CodeChallengeMethod, OAuth2Client } from "arctic";
import { getAuthorizationEndpoint, getOAuthRedirectUri } from "./oauthConfig";

export const createOAuthClient = ({
	clientId,
	port,
}: {
	clientId: string;
	port: number;
}): OAuth2Client =>
	new OAuth2Client(clientId, null, getOAuthRedirectUri({ port }));

export const buildAuthorizationUrl = ({
	client,
	backendUrl,
	scopes,
	state,
	codeVerifier,
}: {
	client: OAuth2Client;
	backendUrl: string;
	scopes: readonly string[];
	state: string;
	codeVerifier: string;
}): URL => {
	const url = client.createAuthorizationURLWithPKCE(
		getAuthorizationEndpoint({ backendUrl }),
		state,
		CodeChallengeMethod.S256,
		codeVerifier,
		[...scopes],
	);
	// Always show the org picker; a silent grant would pin the wrong org.
	url.searchParams.set("prompt", "consent");
	return url;
};
