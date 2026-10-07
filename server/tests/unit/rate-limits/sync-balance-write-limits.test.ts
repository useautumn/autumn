import { describe, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getRateLimitType,
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const typeFor = ({
	spec,
	apiVersion,
	body,
}: {
	spec: string;
	apiVersion: ApiVersion;
	body: Record<string, unknown>;
}) => {
	const [method, path] = spec.split(" ");
	const ctx = {
		apiVersion: new ApiVersionClass(apiVersion),
		requestBody: body,
	};
	return getRateLimitType({
		req: { method, path },
		get: () => ctx,
	} as unknown as Context<HonoEnv>);
};

const TRACK_SPECS = [
	"POST /v1/balances.track",
	"POST /v1/track",
	"POST /v1/events",
	"POST /v1/balances.track_tokens",
	"POST /v1/track_tokens",
];
const CHECK_SPECS = [
	"POST /v1/balances.check",
	"POST /v1/check",
	"POST /v1/entitled",
];
const lockBody = { lock: { enabled: true, lock_id: "lock_1" } };

describe("2.5 synchronous balance write limits", () => {
	test("track and track_tokens with async: false use SyncBalanceWrite", () => {
		for (const spec of TRACK_SPECS) {
			expect(
				typeFor({ spec, apiVersion: ApiVersion.V2_5, body: { async: false } }),
			).toBe(RateLimitType.SyncBalanceWrite);
		}
	});

	test("default and async: true track keep Track", () => {
		for (const spec of TRACK_SPECS) {
			for (const body of [{}, { async: true }]) {
				expect(typeFor({ spec, apiVersion: ApiVersion.V2_5, body })).toBe(
					RateLimitType.Track,
				);
			}
		}
	});

	test("check with lock or send_event uses SyncBalanceWrite", () => {
		for (const spec of CHECK_SPECS) {
			for (const body of [lockBody, { send_event: true }]) {
				expect(typeFor({ spec, apiVersion: ApiVersion.V2_5, body })).toBe(
					RateLimitType.SyncBalanceWrite,
				);
			}
		}
	});

	test("a plain check keeps Check", () => {
		for (const spec of CHECK_SPECS) {
			for (const body of [{}, { send_event: false }]) {
				expect(typeFor({ spec, apiVersion: ApiVersion.V2_5, body })).toBe(
					RateLimitType.Check,
				);
			}
		}
	});

	test("2.4 and older are unchanged for sync writes", () => {
		for (const apiVersion of [ApiVersion.V2_4, ApiVersion.V1_2]) {
			for (const spec of TRACK_SPECS) {
				expect(typeFor({ spec, apiVersion, body: { async: false } })).toBe(
					RateLimitType.Track,
				);
			}
			for (const spec of CHECK_SPECS) {
				for (const body of [lockBody, { send_event: true }]) {
					expect(typeFor({ spec, apiVersion, body })).toBe(RateLimitType.Check);
				}
			}
		}
	});

	test("balance updates, finalize and usage never use SyncBalanceWrite", () => {
		for (const spec of [
			"POST /v1/balances.update",
			"POST /v1/balances.finalize",
			"POST /v1/usage",
		]) {
			expect(
				typeFor({ spec, apiVersion: ApiVersion.V2_5, body: { async: false } }),
			).toBe(RateLimitType.Track);
		}
	});

	test("500/s per customer under a 120k/min org cap, both in Redis and rejecting", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.SyncBalanceWrite]).toEqual({
			limit: 500,
			windowMs: 1000,
			scope: RateLimitScope.Customer,
			store: "redis",
			orgLimit: RateLimitType.SyncBalanceWriteOrg,
		});
		expect(RATE_LIMIT_CONFIGS[RateLimitType.SyncBalanceWriteOrg]).toEqual({
			limit: 120_000,
			windowMs: 60_000,
			scope: RateLimitScope.Org,
			store: "redis",
		});
	});
});
