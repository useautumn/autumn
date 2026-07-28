/**
 * TDD contract for self-serve OIDC SSO domain handling.
 *
 * Contract under test:
 * - company domains are normalized to a bare lower-case hostname
 * - malformed domains, URLs, IP addresses, and public suffixes are rejected
 * - verification records use Autumn's branded DNS label
 * - split TXT chunks are flattened before exact token comparison
 * - OIDC issuer origins must be HTTPS in production; localhost HTTP is dev-only
 */

import { describe, expect, test } from "bun:test";
import {
	buildSsoVerificationHost,
	isMatchingSsoVerificationRecord,
	normalizeSsoDomain,
	validateSsoIssuer,
} from "@/internal/auth/sso/ssoDomainUtils.js";
import { getSsoProviderIdFromCallbackPath } from "@/internal/auth/sso/ssoInvitationProvisioning.js";

describe("SSO domain utilities", () => {
	test("normalizes a company domain", () => {
		expect(normalizeSsoDomain("  EXAMPLE.COM. ")).toBe("example.com");
	});

	test.each(["https://example.com", "127.0.0.1", "com", "bad domain"])(
		"rejects invalid domain %s",
		(domain) => {
			expect(() => normalizeSsoDomain(domain)).toThrow();
		},
	);

	test("builds the Autumn-branded verification hostname", () => {
		expect(
			buildSsoVerificationHost({
				domain: "example.com",
				providerId: "org_123",
			}),
		).toBe("_autumn-sso-verification-org_123.example.com");
	});

	test("matches raw and identifier-prefixed TXT values exactly", () => {
		const token = "random-token";
		const identifier = "_autumn-sso-verification-org_123";

		expect(
			isMatchingSsoVerificationRecord({
				records: [["random-", "token"]],
				identifier,
				token,
			}),
		).toBe(true);
		expect(
			isMatchingSsoVerificationRecord({
				records: [[`${identifier}=`, token]],
				identifier,
				token,
			}),
		).toBe(true);
		expect(
			isMatchingSsoVerificationRecord({
				records: [["random-token-extra"]],
				identifier,
				token,
			}),
		).toBe(false);
	});

	test("requires HTTPS except for localhost in development", () => {
		expect(
			validateSsoIssuer({
				issuer: "https://acme.okta.com",
				isProduction: true,
			}).origin,
		).toBe("https://acme.okta.com");
		expect(() =>
			validateSsoIssuer({
				issuer: "http://acme.okta.com",
				isProduction: true,
			}),
		).toThrow();
		expect(
			validateSsoIssuer({
				issuer: "http://localhost:9090",
				isProduction: false,
			}).origin,
		).toBe("http://localhost:9090");
		expect(() =>
			validateSsoIssuer({
				issuer: "https://idp.customer.example",
				isProduction: true,
			}),
		).toThrow("Okta, Microsoft Entra, Google Workspace, or Auth0");
	});

	test.each([
		"https://acme.okta.com/oauth2/default",
		"https://login.microsoftonline.com/tenant/v2.0",
		"https://accounts.google.com",
		"https://acme.eu.auth0.com",
	])("accepts supported hosted issuer %s", (issuer) => {
		expect(
			validateSsoIssuer({
				issuer,
				isProduction: true,
			}).href,
		).toBe(new URL(issuer).href);
	});

	test("extracts the provider from an OIDC callback path only", () => {
		expect(
			getSsoProviderIdFromCallbackPath("/sso/callback/autumn-provider%2D123"),
		).toBe("autumn-provider-123");
		expect(
			getSsoProviderIdFromCallbackPath("/sso/callback/:providerId", {
				providerId: "autumn-provider-123",
			}),
		).toBe("autumn-provider-123");
		expect(
			getSsoProviderIdFromCallbackPath("/sso/callback/:providerId"),
		).toBeNull();
		expect(getSsoProviderIdFromCallbackPath("/sign-in/email-otp")).toBeNull();
	});
});
