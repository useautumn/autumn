/** Regression: atmn reward scopes must self-heal before Better Auth validates the full authorize request. */

import { expect, test } from "bun:test";
import { oauthClient } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { buildCliOAuthScopes } from "../../../../packages/atmn/src/commands/auth/oauth.js";

const { db } = initDrizzle();
const baseUrl =
	process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
	`http://localhost:${process.env.SERVER_PORT ?? "8080"}`;

test("atmn authorize accepts the complete CLI scope set", async () => {
	const clientId = generateId("oauth_client");
	const redirectUri = "http://localhost:31448/";
	const scopes = buildCliOAuthScopes();

	try {
		await db.insert(oauthClient).values({
			id: generateId("oauth_client"),
			clientId,
			name: "atmn",
			redirectUris: [redirectUri],
			scopes: scopes.filter((scope) => !scope.startsWith("rewards:")),
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const authorizeUrl = new URL(`${baseUrl}/api/auth/oauth2/authorize`);
		authorizeUrl.search = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: scopes.join(" "),
			state: "atmn-reward-scope-test",
			code_challenge: "A".repeat(43),
			code_challenge_method: "S256",
			prompt: "consent",
		}).toString();

		const response = await fetch(authorizeUrl, { redirect: "manual" });
		const location = response.headers.get("location") ?? "";

		expect(response.status).toBe(302);
		expect(location).not.toContain("error=invalid_scope");
		expect(new URL(location).pathname).toBe("/sign-in");
	} finally {
		await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
	}
});
