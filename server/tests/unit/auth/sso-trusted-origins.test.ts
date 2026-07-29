import { describe, expect, it } from "bun:test";
import { getSsoIssuerOrigins } from "@/internal/auth/sso/ssoTrustedOrigins.js";

describe("getSsoIssuerOrigins", () => {
	it("includes the Google hosts that serve token, userinfo and jwks", () => {
		expect(getSsoIssuerOrigins("https://accounts.google.com")).toEqual([
			"https://accounts.google.com",
			"https://oauth2.googleapis.com",
			"https://openidconnect.googleapis.com",
			"https://www.googleapis.com",
		]);
	});

	it("includes Microsoft Graph for Entra tenants", () => {
		expect(
			getSsoIssuerOrigins("https://login.microsoftonline.com/tenant-id/v2.0"),
		).toEqual([
			"https://login.microsoftonline.com",
			"https://graph.microsoft.com",
		]);
	});

	it("keeps single-origin providers to their own origin", () => {
		expect(getSsoIssuerOrigins("https://acme.okta.com")).toEqual([
			"https://acme.okta.com",
		]);
		expect(getSsoIssuerOrigins("http://localhost:9090")).toEqual([
			"http://localhost:9090",
		]);
	});

	it("does not trust a lookalike host", () => {
		expect(
			getSsoIssuerOrigins("https://accounts.google.com.evil.test"),
		).toEqual(["https://accounts.google.com.evil.test"]);
	});
});
