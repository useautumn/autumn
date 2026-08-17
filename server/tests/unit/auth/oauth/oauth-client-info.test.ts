import { describe, expect, test } from "bun:test";
import { SUMMER_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import { buildOAuthClientInfoResponse } from "@/internal/auth/oauth/handleGetOAuthClient.js";

describe("buildOAuthClientInfoResponse", () => {
	test("sources the display name from the client's own name for a dynamic client", () => {
		const response = buildOAuthClientInfoResponse({
			clientId: "oauth_client_abc",
			name: "Cursor",
			metadata: { kind: "mcp_client" },
		});

		expect(response.name).toBe("Cursor");
		expect(response.registration).toBe("dynamic");
	});

	// Regression: inferClientNameFromRedirectUri used to return "MCP client" and
	// shadow the client's real name when the redirect uri had no vendor substring.
	test("keeps the real name when the redirect uri has no vendor substring", () => {
		const response = buildOAuthClientInfoResponse({
			clientId: "oauth_client_def",
			name: "Acme Internal Tool",
			metadata: { kind: "mcp_client" },
		});

		expect(response.name).toBe("Acme Internal Tool");
		expect(response.name).not.toBe("MCP client");
	});

	test("reports registration reserved for a pre-registered reserved client", () => {
		const response = buildOAuthClientInfoResponse({
			clientId: SUMMER_OAUTH_CLIENT_ID,
			name: "Summer",
			metadata: { kind: "summer" },
		});

		expect(response.registration).toBe("reserved");
		expect(response.default_env).toBe("sandbox");
	});

	test("falls back to a neutral default when the name is absent", () => {
		const response = buildOAuthClientInfoResponse({
			clientId: "oauth_client_ghi",
			name: null,
		});

		expect(response.name).toBe("Unknown Application");
		expect(response.registration).toBe("dynamic");
	});
});
