import { expect, test } from "bun:test";
import type { ApiError } from "../../src/lib/api/client.js";
import { isAuthError } from "../../src/lib/hooks/useAuthRecovery.js";

const apiError = (status: number, response?: unknown): ApiError => {
	const error = new Error(`API request failed: ${status}`) as ApiError;
	error.status = status;
	error.response = response;
	return error;
};

test("401 is recoverable — re-authenticating mints a fresh session", () => {
	expect(isAuthError(apiError(401))).toBe(true);
});

test("403 is not recoverable — re-auth remints the same insufficient scopes", () => {
	const insufficientScopes = apiError(403, {
		code: "insufficient_scopes",
		message: "Missing required scope: rewards:read",
	});
	expect(isAuthError(insufficientScopes)).toBe(false);
});

test("non-auth failures are not routed through auth recovery", () => {
	for (const status of [400, 404, 429, 500]) {
		expect(isAuthError(apiError(status))).toBe(false);
	}
});

test("non-API errors are not auth errors", () => {
	expect(isAuthError(new Error("network down"))).toBe(false);
	expect(isAuthError(null)).toBe(false);
	expect(isAuthError(undefined)).toBe(false);
});
