import { expect, test } from "bun:test";
import { META_SCOPES, MODERN_SCOPES, OPENID_SCOPES } from "@autumn/shared";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/utils/auth.js";

test("OAuth metadata advertises only public scopes", async () => {
	const response = await oauthProviderAuthServerMetadata(auth)(
		new Request(
			"http://localhost:8080/.well-known/oauth-authorization-server/api/auth",
		),
	);
	const metadata = (await response.json()) as { scopes_supported?: string[] };

	expect(response.status).toBe(200);
	expect(metadata.scopes_supported).toEqual([
		...OPENID_SCOPES,
		...MODERN_SCOPES,
	]);
	for (const scope of META_SCOPES) {
		expect(metadata.scopes_supported).not.toContain(scope);
	}
});
