import { expect, test } from "bun:test";
import { parseSsoResolveResponse } from "@/lib/sso/ssoResolve";

test("reads an sso action with a usable url", () => {
	expect(
		parseSsoResolveResponse({
			action: "sso",
			url: "https://login.acme.com/authorize",
		}),
	).toEqual({ action: "sso", url: "https://login.acme.com/authorize" });
});

test("reads an otp action", () => {
	expect(parseSsoResolveResponse({ action: "otp" })).toEqual({ action: "otp" });
});

// The backend owns the decision, so an unusable payload must never be coerced
// into an OTP fallback for what could be an SSO-only domain.
test("rejects payloads that don't state a usable action", () => {
	expect(parseSsoResolveResponse(null)).toBeNull();
	expect(parseSsoResolveResponse("otp")).toBeNull();
	expect(parseSsoResolveResponse({})).toBeNull();
	expect(parseSsoResolveResponse({ action: "sso" })).toBeNull();
	expect(
		parseSsoResolveResponse({ action: "sso", url: "javascript:alert(1)" }),
	).toBeNull();
	expect(parseSsoResolveResponse({ action: "password" })).toBeNull();
});
