import { expect, test } from "bun:test";
import {
	buildSsoCallbackUrl,
	isSafeSsoRedirectUrl,
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

test("returns null when no providerId is available", () => {
	expect(
		resolveCallbackProviderId({
			queryProviderId: null,
			rememberedProviderId: null,
		}),
	).toBeNull();
});
