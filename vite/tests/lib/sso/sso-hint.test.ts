import { expect, test } from "bun:test";
import { parseSsoHint } from "@/lib/sso/ssoHint";

test("parses a complete hint", () => {
	expect(
		parseSsoHint(
			JSON.stringify({
				providerId: "sso_acme",
				organizationName: "Acme",
				logo: "https://cdn.acme.com/logo.png",
			}),
		),
	).toEqual({
		providerId: "sso_acme",
		organizationName: "Acme",
		logo: "https://cdn.acme.com/logo.png",
	});
});

test("normalizes a missing or empty logo to null", () => {
	expect(
		parseSsoHint(
			JSON.stringify({ providerId: "sso_acme", organizationName: "Acme" }),
		),
	).toEqual({ providerId: "sso_acme", organizationName: "Acme", logo: null });

	expect(
		parseSsoHint(
			JSON.stringify({
				providerId: "sso_acme",
				organizationName: "Acme",
				logo: "",
			}),
		),
	).toEqual({ providerId: "sso_acme", organizationName: "Acme", logo: null });
});

// A half-written hint must not render a "Continue with  SSO" button.
test("rejects absent, malformed, and incomplete hints", () => {
	expect(parseSsoHint(null)).toBeNull();
	expect(parseSsoHint("")).toBeNull();
	expect(parseSsoHint("not json")).toBeNull();
	expect(parseSsoHint("null")).toBeNull();
	expect(parseSsoHint(JSON.stringify({ providerId: "sso_acme" }))).toBeNull();
	expect(parseSsoHint(JSON.stringify({ organizationName: "Acme" }))).toBeNull();
	expect(
		parseSsoHint(JSON.stringify({ providerId: "", organizationName: "Acme" })),
	).toBeNull();
	expect(
		parseSsoHint(JSON.stringify({ providerId: 7, organizationName: "Acme" })),
	).toBeNull();
});
