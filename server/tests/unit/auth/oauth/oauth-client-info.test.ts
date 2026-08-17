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
	});

	test("defaults the reserved Summer client to the sandbox environment", () => {
		const response = buildOAuthClientInfoResponse({
			clientId: SUMMER_OAUTH_CLIENT_ID,
			name: "Summer",
			metadata: { kind: "summer" },
		});

		expect(response.default_env).toBe("sandbox");
	});

	test("falls back to a neutral default when the name is absent", () => {
		const response = buildOAuthClientInfoResponse({
			clientId: "oauth_client_ghi",
			name: null,
		});

		expect(response.name).toBe("Unknown Application");
	});
});
