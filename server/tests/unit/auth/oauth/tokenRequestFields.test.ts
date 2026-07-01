import { describe, expect, test } from "bun:test";
import { getRefreshTokenForConsentLookup } from "@/internal/auth/oauth/tokenRequestFields.js";

const formRequest = (fields: Record<string, string>) =>
	new Request("http://localhost/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(fields),
	});

describe("OAuth token request fields", () => {
	test("ignores refresh_token fields on non-refresh grants", async () => {
		await expect(
			getRefreshTokenForConsentLookup(
				formRequest({
					grant_type: "authorization_code",
					code: "code_1",
					refresh_token: "refresh_unrelated",
				}),
			),
		).resolves.toBeNull();
	});

	test("returns refresh_token only for refresh grants", async () => {
		await expect(
			getRefreshTokenForConsentLookup(
				formRequest({
					grant_type: "refresh_token",
					refresh_token: "refresh_1",
				}),
			),
		).resolves.toBe("refresh_1");
	});

	test("supports JSON token requests", async () => {
		await expect(
			getRefreshTokenForConsentLookup(
				new Request("http://localhost/api/auth/oauth2/token", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						grant_type: "refresh_token",
						refresh_token: "refresh_json",
					}),
				}),
			),
		).resolves.toBe("refresh_json");
	});
});
