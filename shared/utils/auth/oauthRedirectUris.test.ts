import { describe, expect, test } from "bun:test";
import { isSafeOAuthRedirectUri } from "./oauthRedirectUris";

describe("isSafeOAuthRedirectUri", () => {
	test("allows https and custom schemes", () => {
		expect(isSafeOAuthRedirectUri("https://cursor.com/callback")).toBe(true);
		expect(isSafeOAuthRedirectUri("slack://autumn-chat")).toBe(true);
		expect(isSafeOAuthRedirectUri("cursor://anysphere.cursor-retrieval")).toBe(
			true,
		);
	});

	test("allows plain http only on the loopback hostnames", () => {
		expect(isSafeOAuthRedirectUri("http://localhost:8080/callback")).toBe(true);
		expect(isSafeOAuthRedirectUri("http://127.0.0.1:31548/")).toBe(true);
		expect(isSafeOAuthRedirectUri("http://[::1]:31548/")).toBe(true);
		expect(isSafeOAuthRedirectUri("http://evil.example.com/callback")).toBe(
			false,
		);
		expect(isSafeOAuthRedirectUri("http://localhost.evil.com/cb")).toBe(false);
	});

	test("rejects script-bearing schemes", () => {
		expect(isSafeOAuthRedirectUri("javascript:alert(1)")).toBe(false);
		expect(isSafeOAuthRedirectUri("data:text/html,<script>")).toBe(false);
		expect(isSafeOAuthRedirectUri("vbscript:msgbox")).toBe(false);
	});

	test("rejects unparseable values", () => {
		expect(isSafeOAuthRedirectUri("")).toBe(false);
		expect(isSafeOAuthRedirectUri("/callback")).toBe(false);
	});
});
