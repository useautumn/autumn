/** The URL is the whole contract with the authorization server. */

import { expect, test } from "bun:test";
import {
	buildAuthorizationUrl,
	createOAuthClient,
} from "../src/auth/buildAuthorizationUrl";
import { CLI_OAUTH_SCOPES, OAUTH_PORTS } from "../src/auth/oauthConfig";

const buildUrl = ({ port }: { port: number }): URL =>
	buildAuthorizationUrl({
		client: createOAuthClient({ clientId: "cli_client", port }),
		backendUrl: "http://localhost:8080",
		scopes: CLI_OAUTH_SCOPES,
		state: "state_value",
		codeVerifier: "verifier_value",
	});

test("asks for PKCE against the backend's authorize endpoint", () => {
	const url = buildUrl({ port: OAUTH_PORTS[0] });

	expect(url.origin + url.pathname).toBe(
		"http://localhost:8080/api/auth/oauth2/authorize",
	);
	expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	expect(url.searchParams.get("code_challenge")).toBeTruthy();
	expect(url.searchParams.get("state")).toBe("state_value");
	// The verifier is the secret half — it must never leave the process.
	expect(url.search).not.toContain("verifier_value");
});

test("redirects to the loopback port the callback server is on", () => {
	expect(buildUrl({ port: 31450 }).searchParams.get("redirect_uri")).toBe(
		"http://localhost:31450/",
	);
});

test("requests modern read/write scopes and forces the org picker", () => {
	const url = buildUrl({ port: OAUTH_PORTS[0] });

	expect(url.searchParams.get("scope")?.split(" ")).toEqual([
		...CLI_OAUTH_SCOPES,
	]);
	expect(url.searchParams.get("prompt")).toBe("consent");
});
