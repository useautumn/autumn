import { expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import {
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	oauthAccessToken,
	oauthClient,
} from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	type DashboardSession,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

const { db } = initDrizzle();
const baseUrl =
	process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
	`http://localhost:${process.env.SERVER_PORT ?? "8080"}`;

const REDIRECT_URI = "http://127.0.0.1:33418/callback";

const createPkcePair = () => {
	const verifier = randomBytes(32).toString("base64url");
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url"),
	};
};

const initializeBody = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "autumn-e2e-test", version: "1.0.0" },
	},
};

/** Streamable HTTP replies as SSE when the client accepts it, so unwrap `data:`. */
const parseMcpPayload = (text: string) => {
	const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
	try {
		return JSON.parse(dataLine ? dataLine.slice(5).trim() : text) as Record<
			string,
			unknown
		>;
	} catch {
		return null;
	}
};

const postMcp = async ({
	body,
	sessionId,
	token,
	url,
}: {
	body: unknown;
	sessionId?: string | null;
	token?: string;
	url: string;
}) => {
	const headers = new Headers({
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
	});
	if (token) headers.set("Authorization", `Bearer ${token}`);
	if (sessionId) headers.set("mcp-session-id", sessionId);

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	const text = await response.text();
	return { payload: parseMcpPayload(text), response, text };
};

/** Discovery is the first hop to the resource host, whose fresh edge connection can transiently fail. */
const fetchDiscovery = async (url: string, attempts = 3) => {
	let response = await fetch(url);
	for (let attempt = 1; attempt < attempts && !response.ok; attempt++) {
		await Bun.sleep(250);
		response = await fetch(url);
	}
	return response;
};

const registerClient = async ({ clientName }: { clientName: string }) => {
	const response = await fetch(`${baseUrl}/api/auth/oauth2/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_name: clientName,
			redirect_uris: [REDIRECT_URI],
			scope: [...DEFAULT_OAUTH_RESOURCE_SCOPES, "offline_access"].join(" "),
		}),
	});
	const body = (await response.json()) as Record<string, unknown>;
	return { body, status: response.status };
};

const sessionHeaders = ({
	extra,
	session,
}: {
	extra?: Record<string, string>;
	session: DashboardSession;
}) => {
	const headers = new Headers(session.headers);
	for (const [key, value] of Object.entries(extra ?? {})) {
		headers.set(key, value);
	}
	return headers;
};

/** Walks /authorize -> consent page redirect -> /consent, returning the callback redirect. */
const authorizeWithConsent = async ({
	clientId,
	resource,
	scopes,
	session,
}: {
	clientId: string;
	resource: string;
	scopes: string[];
	session: DashboardSession;
}) => {
	const pkce = createPkcePair();
	const state = randomBytes(16).toString("base64url");
	const authorizeUrl = new URL(`${baseUrl}/api/auth/oauth2/authorize`);
	for (const [key, value] of Object.entries({
		client_id: clientId,
		code_challenge: pkce.challenge,
		code_challenge_method: "S256",
		redirect_uri: REDIRECT_URI,
		resource,
		response_type: "code",
		scope: scopes.join(" "),
		state,
	})) {
		authorizeUrl.searchParams.set(key, value);
	}

	const authorizeResponse = await fetch(authorizeUrl, {
		headers: sessionHeaders({ session }),
		redirect: "manual",
	});
	const consentLocation = authorizeResponse.headers.get("location");
	if (!consentLocation) {
		throw new Error(
			`authorize did not redirect (${authorizeResponse.status}): ${await authorizeResponse.text()}`,
		);
	}
	const oauthQuery = new URL(consentLocation).search.replace(/^\?/, "");

	// better-auth CSRF-checks cookie-authed POSTs, so consent must look like it
	// came from the consent page it just redirected to.
	const consentResponse = await fetch(`${baseUrl}/api/auth/oauth2/consent`, {
		method: "POST",
		headers: sessionHeaders({
			extra: {
				Accept: "application/json",
				"Content-Type": "application/json",
				Origin: new URL(consentLocation).origin,
			},
			session,
		}),
		body: JSON.stringify({
			accept: true,
			env: "sandbox",
			oauth_query: oauthQuery,
			scope: new URLSearchParams(oauthQuery).get("scope") ?? undefined,
		}),
	});
	const consentBody = (await consentResponse.json()) as Record<string, unknown>;

	return {
		authorizeStatus: authorizeResponse.status,
		codeVerifier: pkce.verifier,
		consentBody,
		consentLocation,
		consentStatus: consentResponse.status,
		state,
	};
};

const exchangeCode = async ({
	clientId,
	code,
	codeVerifier,
	resource,
}: {
	clientId: string;
	code: string;
	codeVerifier: string;
	resource: string;
}) => {
	const response = await fetch(`${baseUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			code,
			code_verifier: codeVerifier,
			grant_type: "authorization_code",
			redirect_uri: REDIRECT_URI,
			resource,
		}),
	});
	return {
		body: (await response.json()) as Record<string, unknown>,
		status: response.status,
	};
};

const getCallbackCode = (consentBody: Record<string, unknown>) => {
	const redirect = consentBody.url ?? consentBody.redirect_uri;
	if (typeof redirect !== "string") {
		throw new Error(
			`consent returned no redirect: ${JSON.stringify(consentBody)}`,
		);
	}
	const url = new URL(redirect);
	const code = url.searchParams.get("code");
	if (!code) throw new Error(`consent redirect carried no code: ${redirect}`);
	return { code, iss: url.searchParams.get("iss"), url };
};

const grantTokenForResource = async ({
	clientId,
	resource,
	scopes,
	session,
}: {
	clientId: string;
	resource: string;
	scopes: string[];
	session: DashboardSession;
}) => {
	const consent = await authorizeWithConsent({
		clientId,
		resource,
		scopes,
		session,
	});
	expect(consent.consentStatus).toBe(200);
	const callback = getCallbackCode(consent.consentBody);
	const token = await exchangeCode({
		clientId,
		code: callback.code,
		codeVerifier: consent.codeVerifier,
		resource,
	});
	return { callback, consent, token };
};

test("MCP OAuth end to end: challenge, discovery, DCR, consent, token, tool call", async () => {
	const session = await createDashboardSession(defaultCtx);
	let clientId: string | null = null;

	try {
		// 1. Unauthenticated challenge
		const challenge = await postMcp({
			body: initializeBody,
			url: `${baseUrl}/mcp`,
		});
		expect(challenge.response.status).toBe(401);
		const wwwAuthenticate =
			challenge.response.headers.get("www-authenticate") ?? "";
		expect(wwwAuthenticate).toContain("resource_metadata=");
		expect(wwwAuthenticate).toContain("scope=");
		expect(wwwAuthenticate).toContain('error="invalid_token"');

		const metadataUrl = wwwAuthenticate.match(
			/resource_metadata="([^"]+)"/,
		)?.[1];
		if (!metadataUrl)
			throw new Error(`no resource_metadata: ${wwwAuthenticate}`);
		const metadataResponse = await fetchDiscovery(metadataUrl);
		expect(metadataResponse.status).toBe(200);
		const metadata = (await metadataResponse.json()) as {
			authorization_servers: string[];
			resource: string;
			scopes_supported: string[];
		};
		expect(metadata.authorization_servers.length).toBeGreaterThan(0);
		expect(metadata.scopes_supported).not.toContain("offline_access");

		const mcpUrl = metadata.resource;
		const challengeScopes = (
			wwwAuthenticate.match(/scope="([^"]+)"/)?.[1] ?? ""
		).split(" ");
		expect(challengeScopes.length).toBeGreaterThan(0);

		// 2. Authorization server discovery
		const asMetadataResponse = await fetchDiscovery(
			`${baseUrl}/.well-known/oauth-authorization-server/api/auth`,
		);
		expect(asMetadataResponse.status).toBe(200);
		const asMetadata = (await asMetadataResponse.json()) as {
			code_challenge_methods_supported: string[];
			registration_endpoint: string;
		};
		expect(asMetadata.code_challenge_methods_supported).toContain("S256");
		expect(typeof asMetadata.registration_endpoint).toBe("string");

		// 3. Dynamic client registration
		const registration = await registerClient({
			clientName: `Autumn E2E ${randomBytes(6).toString("hex")}`,
		});
		expect(registration.status).toBe(201);
		expect(typeof registration.body.client_id).toBe("string");
		clientId = registration.body.client_id as string;

		// 4-5. Authorize, consent, token exchange bound to the MCP resource
		const requestedScopes = [...challengeScopes, "offline_access"];
		const granted = await grantTokenForResource({
			clientId,
			resource: mcpUrl,
			scopes: requestedScopes,
			session,
		});
		expect(granted.token.status).toBe(200);
		const accessToken = granted.token.body.access_token as string;
		expect(accessToken).toStartWith("am_oauth_");
		expect(typeof granted.token.body.refresh_token).toBe("string");
		const grantedScopes = (granted.token.body.scope as string).split(" ");
		for (const scope of challengeScopes) {
			expect(grantedScopes).toContain(scope);
		}

		const tokenRow = await db.query.oauthAccessToken.findFirst({
			where: eq(
				oauthAccessToken.token,
				await hashOAuthToken(accessToken.replace(/^am_oauth_/, "")),
			),
		});
		expect(tokenRow?.resource).toBe(mcpUrl);

		// 6. Real MCP traffic
		const initialize = await postMcp({
			body: initializeBody,
			token: accessToken,
			url: mcpUrl,
		});
		expect(initialize.response.status).toBe(200);
		const mcpSessionId = initialize.response.headers.get("mcp-session-id");
		expect(typeof mcpSessionId).toBe("string");

		await postMcp({
			body: { jsonrpc: "2.0", method: "notifications/initialized" },
			sessionId: mcpSessionId,
			token: accessToken,
			url: mcpUrl,
		});

		const toolsList = await postMcp({
			body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
			sessionId: mcpSessionId,
			token: accessToken,
			url: mcpUrl,
		});
		expect(toolsList.response.status).toBe(200);
		const tools = (toolsList.payload?.result as { tools?: unknown[] })?.tools;
		expect(Array.isArray(tools)).toBe(true);
		expect((tools as unknown[]).length).toBeGreaterThan(0);

		const toolCall = await postMcp({
			body: {
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "getCurrentOrganization", arguments: {} },
			},
			sessionId: mcpSessionId,
			token: accessToken,
			url: mcpUrl,
		});
		expect(toolCall.response.status).toBe(200);
		const toolResult = toolCall.payload?.result as {
			content?: { text?: string }[];
			isError?: boolean;
		};
		expect(toolResult?.isError).toBeFalsy();
		expect(Array.isArray(toolResult?.content)).toBe(true);
		expect(toolResult?.content?.[0]?.text).toContain(defaultCtx.org.id);

		// 7. Audience negative: a token minted for the API root is rejected at /mcp
		const apiRoot = new URL(metadata.authorization_servers[0] as string).origin;
		const foreign = await grantTokenForResource({
			clientId,
			resource: apiRoot,
			scopes: requestedScopes,
			session,
		});
		expect(foreign.token.status).toBe(200);
		const foreignToken = foreign.token.body.access_token as string;
		const foreignRow = await db.query.oauthAccessToken.findFirst({
			where: eq(
				oauthAccessToken.token,
				await hashOAuthToken(foreignToken.replace(/^am_oauth_/, "")),
			),
		});
		expect(foreignRow?.resource).toBe(apiRoot);

		const rejected = await postMcp({
			body: initializeBody,
			token: foreignToken,
			url: mcpUrl,
		});
		expect(rejected.response.status).toBe(401);
		expect(rejected.response.headers.get("www-authenticate")).toContain(
			'error="invalid_token"',
		);
	} finally {
		if (clientId) {
			await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
		}
		await session.cleanup();
	}
});
