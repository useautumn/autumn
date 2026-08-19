import { describe, expect, test } from "bun:test";
import { oauthRouter } from "@/internal/auth/oauth/oauthRouter.js";

const DISCOVERY_PATHS = [
	"/.well-known/oauth-authorization-server",
	"/api/auth/.well-known/oauth-authorization-server",
	"/.well-known/oauth-authorization-server/api/auth",
	"/api/auth/.well-known/openid-configuration",
];

const getMetadata = async (path: string) => {
	const response = await oauthRouter.request(`http://localhost:8080${path}`);
	expect(response.status).toBe(200);
	return (await response.json()) as Record<string, unknown>;
};

describe("OAuth discovery metadata", () => {
	// Codex CLI rejects our iss-less callback whenever discovery claims RFC 9207,
	// and it reads whichever document it finds first.
	test.each(DISCOVERY_PATHS)(
		"%s does not advertise iss parameter support",
		async (path) => {
			const metadata = await getMetadata(path);

			expect(metadata.authorization_response_iss_parameter_supported).toBe(
				false,
			);
		},
	);

	test("openid-configuration keeps its OpenID Connect fields", async () => {
		const metadata = await getMetadata(
			"/api/auth/.well-known/openid-configuration",
		);

		expect(metadata.issuer).toBeString();
		expect(metadata.jwks_uri).toBeString();
		expect(metadata.subject_types_supported).toBeArray();
		expect(metadata.id_token_signing_alg_values_supported).toBeArray();
	});
});
