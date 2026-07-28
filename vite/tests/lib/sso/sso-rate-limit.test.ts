import { expect, test } from "bun:test";
import {
	formatCooldown,
	getSsoRetryAfterSeconds,
	isRateLimitError,
} from "@/lib/sso/ssoRateLimit";

const rateLimited = (overrides: {
	headers?: Record<string, unknown>;
	data?: Record<string, unknown>;
}) => ({ response: { status: 429, ...overrides } });

test("reads a numeric Retry-After header", () => {
	expect(
		getSsoRetryAfterSeconds(rateLimited({ headers: { "retry-after": "45" } })),
	).toBe(45);
});

test("reads retry hints carried in the body", () => {
	expect(
		getSsoRetryAfterSeconds(rateLimited({ data: { retryAfter: 12 } })),
	).toBe(12);
	expect(
		getSsoRetryAfterSeconds(rateLimited({ data: { retry_after_seconds: 90 } })),
	).toBe(90);
});

test("converts an http-date Retry-After into remaining seconds", () => {
	const future = new Date(Date.now() + 30_000).toUTCString();
	const seconds = getSsoRetryAfterSeconds(
		rateLimited({ headers: { "retry-after": future } }),
	);
	expect(seconds).toBeGreaterThan(0);
	expect(seconds).toBeLessThanOrEqual(31);
});

test("caps absurd retry windows to an hour", () => {
	expect(
		getSsoRetryAfterSeconds(
			rateLimited({ headers: { "retry-after": "99999" } }),
		),
	).toBe(3600);
});

test("returns null when there is no retry information", () => {
	expect(getSsoRetryAfterSeconds(new Error("boom"))).toBeNull();
	expect(getSsoRetryAfterSeconds(null)).toBeNull();
	expect(getSsoRetryAfterSeconds(rateLimited({}))).toBeNull();
	expect(
		getSsoRetryAfterSeconds(
			rateLimited({ headers: { "retry-after": "soon" } }),
		),
	).toBeNull();
});

test("detects rate limit responses", () => {
	expect(isRateLimitError(rateLimited({}))).toBe(true);
	expect(isRateLimitError({ response: { status: 400 } })).toBe(false);
	expect(isRateLimitError(new Error("boom"))).toBe(false);
});

test("formats cooldown labels", () => {
	expect(formatCooldown(9)).toBe("9s");
	expect(formatCooldown(60)).toBe("1m");
	expect(formatCooldown(95)).toBe("1m 35s");
});
