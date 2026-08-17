import { describe, expect, test } from "bun:test";
import {
	isLocalhostRedirectUri,
	isSafeOAuthRedirectUri,
} from "./oauthRedirectUris";

describe("isSafeOAuthRedirectUri", () => {
	test("allows https and custom schemes", () => {
		expect(isSafeOAuthRedirectUri("https://cursor.com/callback")).toBe(true);
		expect(isSafeOAuthRedirectUri("slack://autumn-chat")).toBe(true);
		expect(isSafeOAuthRedirectUri("cursor://anysphere.cursor-retrieval")).toBe(
			true,
		);
	});

	test("allows plain http only on localhost", () => {
		expect(isSafeOAuthRedirectUri("http://localhost:8080/callback")).toBe(true);
		expect(isSafeOAuthRedirectUri("http://127.0.0.1:31548/")).toBe(true);
		expect(isSafeOAuthRedirectUri("http://evil.example.com/callback")).toBe(
			false,
		);
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

describe("isLocalhostRedirectUri", () => {
	test("matches the loopback hostnames", () => {
		expect(isLocalhostRedirectUri("localhost")).toBe(true);
		expect(isLocalhostRedirectUri("127.0.0.1")).toBe(true);
		expect(isLocalhostRedirectUri("::1")).toBe(true);
		expect(isLocalhostRedirectUri("localhost.evil.com")).toBe(false);
	});
});
