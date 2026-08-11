import { expect, test } from "bun:test";
import { getDefaultOAuthScopes, MCP_CLIENT_KIND } from "@autumn/auth/oauth";
import {
	AppEnv,
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	Scopes,
} from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { createDashboardSession } from "@tests/utils/testInitUtils/dashboardSession.js";
import { OAuth2Client } from "arctic";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
const baseUrl =
	process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
	`http://localhost:${process.env.SERVER_PORT ?? "8080"}`;

test("MCP OAuth refresh narrows scopes and replays consumed-token retries", async () => {
	const session = await createDashboardSession(defaultCtx);
	const clientId = generateId("oauth_client");
	const consentId = generateId("oauth_consent");
	const refreshToken = "r".repeat(32);
	const grantedScopes = getDefaultOAuthScopes([
		Scopes.Organisation.Read,
		"offline_access",
	]);

	try {
		await db.insert(oauthClient).values({
			id: generateId("oauth_client"),
			clientId,
			name: "Devin",
			redirectUris: ["http://127.0.0.1/callback"],
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES, "offline_access"],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: { kind: MCP_CLIENT_KIND, mcpClientType: "dynamic" },
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.insert(oauthConsent).values({
			id: consentId,
			clientId,
			userId: session.userId,
			referenceId: defaultCtx.org.id,
			scopes: grantedScopes,
			env: AppEnv.Sandbox,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.insert(oauthRefreshToken).values({
			id: generateId("oauth_refresh"),
			token: await hashOAuthToken(refreshToken),
			clientId,
			userId: session.userId,
			referenceId: defaultCtx.org.id,
			oauthConsentId: consentId,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			scopes: grantedScopes,
		});

		const arctic = new OAuth2Client(clientId, null, null);
		const advertisedScopes = [
			...DEFAULT_OAUTH_RESOURCE_SCOPES,
			"offline_access",
		];
		const [tokens, concurrentRetry] = await Promise.all([
			arctic.refreshAccessToken(
				`${baseUrl}/api/auth/oauth2/token`,
				refreshToken,
				advertisedScopes,
			),
			arctic.refreshAccessToken(
				`${baseUrl}/api/auth/oauth2/token`,
				refreshToken,
				advertisedScopes,
			),
		]);

		expect(tokens.accessToken()).toStartWith("am_oauth_");
		expect(tokens.scopes()).toEqual(grantedScopes);
		expect(concurrentRetry.accessToken()).toBe(tokens.accessToken());
		expect(concurrentRetry.refreshToken()).toBe(tokens.refreshToken());

		const retryResponse = await fetch(`${baseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				scope: advertisedScopes.join(" "),
				client_id: clientId,
				refresh_token: refreshToken,
				grant_type: "refresh_token",
			}),
		});
		const retry = (await retryResponse.json()) as Record<string, unknown>;
		expect(retry.access_token).toBe(tokens.accessToken());
		expect(retry.refresh_token).toBe(tokens.refreshToken());

		const replacement = tokens.refreshToken();
		if (!replacement) throw new Error("Missing replacement refresh token");
		await arctic.refreshAccessToken(
			`${baseUrl}/api/auth/oauth2/token`,
			replacement,
			advertisedScopes,
		);

		const mismatchedRetry = await fetch(`${baseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: generateId("oauth_client"),
			}),
		});
		expect(mismatchedRetry.status).toBe(400);

		const organization = await fetch(`${baseUrl}/v1/organization`, {
			headers: {
				Authorization: `Bearer ${tokens.accessToken()}`,
				"x-autumn-oauth-resource": "https://mcp.useautumn.com/mcp",
			},
		});
		expect(organization.status).toBe(200);
	} finally {
		await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
		await session.cleanup();
	}
});
