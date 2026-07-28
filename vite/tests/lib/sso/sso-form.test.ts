import { expect, test } from "bun:test";
import {
	buildSsoConnectionPayload,
	maskClientId,
	normalizeSsoDomain,
	validateSsoForm,
} from "@/lib/sso/ssoForm";

const valid = {
	domain: "acme.com",
	issuer: "https://login.acme.com",
	clientId: "client-123",
	clientSecret: "secret-456",
};

test("normalizes pasted domains", () => {
	expect(normalizeSsoDomain("  Acme.com ")).toBe("acme.com");
	expect(normalizeSsoDomain("https://Acme.com/login")).toBe("acme.com");
	expect(normalizeSsoDomain("http://acme.com:8080/x?y=1")).toBe("acme.com");
	expect(normalizeSsoDomain("acme.com.")).toBe("acme.com");
	expect(normalizeSsoDomain("")).toBe("");
});

test("accepts a complete form", () => {
	expect(validateSsoForm(valid)).toBeNull();
});

test("requires a valid domain", () => {
	expect(validateSsoForm({ ...valid, domain: "" })).toBe(
		"Enter your company domain.",
	);
	expect(validateSsoForm({ ...valid, domain: "acme" })).toBe(
		"Enter a valid company domain, like acme.com.",
	);
});

test("requires an https issuer url", () => {
	expect(validateSsoForm({ ...valid, issuer: "" })).toBe(
		"Enter the OIDC issuer URL.",
	);
	expect(validateSsoForm({ ...valid, issuer: "login.acme.com" })).toBe(
		"Enter a valid issuer URL, like https://login.acme.com.",
	);
	expect(validateSsoForm({ ...valid, issuer: "http://login.acme.com" })).toBe(
		"The issuer URL must use https://.",
	);
});

test("allows an insecure localhost issuer only when explicitly enabled", () => {
	expect(
		validateSsoForm(
			{ ...valid, issuer: "http://localhost:9090" },
			{ allowInsecureLocalhost: true },
		),
	).toBeNull();
	expect(
		validateSsoForm(
			{ ...valid, issuer: "http://127.0.0.1:9090" },
			{ allowInsecureLocalhost: true },
		),
	).toBeNull();
	expect(
		validateSsoForm(
			{ ...valid, issuer: "http://login.acme.com" },
			{ allowInsecureLocalhost: true },
		),
	).toBe("The issuer URL must use https://.");
});

test("requires client credentials", () => {
	expect(validateSsoForm({ ...valid, clientId: "  " })).toBe(
		"Enter the OIDC client ID.",
	);
	expect(validateSsoForm({ ...valid, clientSecret: "  " })).toBe(
		"Enter the OIDC client secret.",
	);
});

test("trims the request payload and strips issuer trailing slash", () => {
	expect(
		buildSsoConnectionPayload({
			domain: "  HTTPS://Acme.com/ ",
			issuer: " https://login.acme.com/ ",
			clientId: " client-123 ",
			clientSecret: " secret-456 ",
		}),
	).toEqual({
		domain: "acme.com",
		issuer: "https://login.acme.com",
		clientId: "client-123",
		clientSecret: "secret-456",
	});
});

test("masks the client id and never exposes more than the last four", () => {
	expect(maskClientId("7f2a")).toBe(
		"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20227f2a",
	);
	expect(maskClientId("")).toBe("\u2022".repeat(12));
});
