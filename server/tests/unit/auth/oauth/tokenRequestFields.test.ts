import { describe, expect, test } from "bun:test";
import { getOAuthTokenRequestFields } from "@/internal/auth/oauth/tokenRequestFields.js";

const formRequest = (fields: Record<string, string>) =>
	new Request("http://localhost/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(fields),
	});

const jsonRequest = (contentType: string, fields: Record<string, string>) =>
	new Request("http://localhost/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": contentType },
		body: JSON.stringify(fields),
	});

describe("getOAuthTokenRequestFields", () => {
	test("reads the grant type alongside a refresh token", async () => {
		expect(
			await getOAuthTokenRequestFields(
				formRequest({
					grant_type: "refresh_token",
					refresh_token: "refresh_1",
				}),
			),
		).toEqual({ grantType: "refresh_token", refreshToken: "refresh_1" });
	});

	test("keeps the grant type that a stray refresh_token belongs to", async () => {
		expect(
			await getOAuthTokenRequestFields(
				formRequest({
					grant_type: "authorization_code",
					code: "code_1",
					refresh_token: "refresh_unrelated",
				}),
			),
		).toEqual({
			grantType: "authorization_code",
			refreshToken: "refresh_unrelated",
		});
	});

	test("supports JSON token requests", async () => {
		expect(
			await getOAuthTokenRequestFields(
				jsonRequest("application/json", {
					grant_type: "refresh_token",
					refresh_token: "refresh_json",
				}),
			),
		).toEqual({ grantType: "refresh_token", refreshToken: "refresh_json" });
	});

	test("supports case-insensitive JSON content types", async () => {
		expect(
			await getOAuthTokenRequestFields(
				jsonRequest("Application/JSON; charset=utf-8", {
					grant_type: "refresh_token",
					refresh_token: "refresh_json_upper",
				}),
			),
		).toEqual({
			grantType: "refresh_token",
			refreshToken: "refresh_json_upper",
		});
	});

	test("reads an empty body as no fields", async () => {
		expect(
			await getOAuthTokenRequestFields(
				new Request("http://localhost/api/auth/oauth2/token", {
					method: "POST",
				}),
			),
		).toEqual({ grantType: null, refreshToken: null });
	});
});
