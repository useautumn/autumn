import { expect, test } from "bun:test";
import {
	buildSsoCallbackUrl,
	describeSsoCallbackError,
	isSafeSsoRedirectUrl,
	parseSsoCallbackQuery,
	resolveCallbackProviderId,
	SSO_CALLBACK_PATH,
} from "@/lib/sso/ssoCallback";

test("builds the completion callback url from an origin", () => {
	expect(buildSsoCallbackUrl("https://app.useautumn.com")).toBe(
		`https://app.useautumn.com${SSO_CALLBACK_PATH}`,
	);
});

test("only allows http(s) redirect urls", () => {
	expect(isSafeSsoRedirectUrl("https://login.acme.com/authorize?x=1")).toBe(
		true,
	);
	expect(isSafeSsoRedirectUrl("http://localhost:8080/api/auth/sso")).toBe(true);
	expect(isSafeSsoRedirectUrl("javascript:alert(1)")).toBe(false);
	expect(isSafeSsoRedirectUrl("/relative/path")).toBe(false);
	expect(isSafeSsoRedirectUrl("")).toBe(false);
	expect(isSafeSsoRedirectUrl(null)).toBe(false);
});

test("prefers the callback query providerId over the remembered one", () => {
	expect(
		resolveCallbackProviderId({
			queryProviderId: "sso_from_query",
			rememberedProviderId: "sso_remembered",
		}),
	).toBe("sso_from_query");
});

test("falls back to the remembered providerId when the callback omits it", () => {
	expect(
		resolveCallbackProviderId({
			queryProviderId: null,
			rememberedProviderId: "sso_remembered",
		}),
	).toBe("sso_remembered");

	expect(
		resolveCallbackProviderId({
			queryProviderId: "   ",
			rememberedProviderId: "sso_remembered",
		}),
	).toBe("sso_remembered");
});

test("recovers the error when better-auth appends it with a second '?'", () => {
	const params = parseSsoCallbackQuery(
		"?providerId=autumn-88a3?error=invalid_provider&error_description=token_response_not_found",
	);
	expect(params.get("providerId")).toBe("autumn-88a3");
	expect(params.get("error")).toBe("invalid_provider");
	expect(params.get("error_description")).toBe("token_response_not_found");
});

test("leaves a well-formed callback query untouched", () => {
	const params = parseSsoCallbackQuery("?providerId=autumn-88a3");
	expect(params.get("providerId")).toBe("autumn-88a3");
	expect(params.get("error")).toBeNull();
});

test("explains a rejected client credential in plain terms", () => {
	expect(
		describeSsoCallbackError({
			error: "invalid_provider",
			description: "token_response_not_found",
		}),
	).toContain("client ID and client secret");
});

test("explains an unlinkable existing account", () => {
	expect(
		describeSsoCallbackError({
			error: "account not linked",
			description: null,
		}),
	).toContain("isn't verified yet");
});

test("surfaces the server's own message for an uninvited user", () => {
	expect(
		describeSsoCallbackError({
			error: "SSO_INVITATION_REQUIRED",
			description:
				"Ask your Autumn admin to invite you to Acme before signing in with SSO.",
		}),
	).toBe(
		"Ask your Autumn admin to invite you to Acme before signing in with SSO.",
	);
});

test("falls back to the raw description, then the error code", () => {
	expect(
		describeSsoCallbackError({
			error: "invalid_provider",
			description: "something_unmapped",
		}),
	).toBe("something_unmapped");
	expect(
		describeSsoCallbackError({ error: "discovery_failed", description: null }),
	).toContain("discovery_failed");
});

test("returns null when no providerId is available", () => {
	expect(
		resolveCallbackProviderId({
			queryProviderId: null,
			rememberedProviderId: null,
		}),
	).toBeNull();
});
