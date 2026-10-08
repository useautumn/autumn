import { afterEach, describe, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { _setAsyncTrackConfigForTesting } from "@/internal/misc/asyncTrack/asyncTrackStore.js";
import {
	getRateLimitRouteGroup,
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const ASYNC_ORG_ID = "org_async_override";

const typeFor = ({
	spec,
	apiVersion,
	body,
	orgId = "org_123",
}: {
	spec: string;
	apiVersion: ApiVersion;
	body: Record<string, unknown>;
	orgId?: string;
}) => {
	const [method, path] = spec.split(" ");
	const ctx = {
		apiVersion: new ApiVersionClass(apiVersion),
		requestBody: body,
		org: { id: orgId, slug: `${orgId}-slug` },
		features: [],
	};
	return getRateLimitRouteGroup({
		req: { method, path },
		get: () => ctx,
	} as unknown as Context<HonoEnv>).type;
};

const TRACK_SPECS = [
	"POST /v1/balances.track",
	"POST /v1/track",
	"POST /v1/events",
];
const TRACK_TOKENS_SPECS = [
	"POST /v1/balances.track_tokens",
	"POST /v1/track_tokens",
];
const CHECK_SPECS = [
	"POST /v1/balances.check",
	"POST /v1/check",
	"POST /v1/entitled",
];
const ALL_VERSIONS = [ApiVersion.V2_5, ApiVersion.V2_4, ApiVersion.V1_2];
const lockBody = { lock: { enabled: true, lock_id: "lock_1" } };

afterEach(() => {
	_setAsyncTrackConfigForTesting({ config: { enabledOrgIds: [] } });
});

describe("synchronous balance write limits", () => {
	test("2.5 track and track_tokens use SyncBalanceWrite only with async: false", () => {
		for (const spec of [...TRACK_SPECS, ...TRACK_TOKENS_SPECS]) {
			expect(
				typeFor({ spec, apiVersion: ApiVersion.V2_5, body: { async: false } }),
			).toBe(RateLimitType.SyncBalanceWrite);
			for (const body of [{}, { async: true }]) {
				expect(typeFor({ spec, apiVersion: ApiVersion.V2_5, body })).toBe(
					RateLimitType.Track,
				);
			}
		}
	});

	test("2.4 and older default tracks are sync, so they use SyncBalanceWrite", () => {
		for (const apiVersion of [ApiVersion.V2_4, ApiVersion.V1_2]) {
			for (const spec of [...TRACK_SPECS, ...TRACK_TOKENS_SPECS]) {
				expect(typeFor({ spec, apiVersion, body: {} })).toBe(
					RateLimitType.SyncBalanceWrite,
				);
				expect(typeFor({ spec, apiVersion, body: { async: true } })).toBe(
					RateLimitType.Track,
				);
			}
		}
	});

	test("an org on the async override stays on Track, as its tracks queue", () => {
		_setAsyncTrackConfigForTesting({
			config: { enabledOrgIds: [ASYNC_ORG_ID] },
		});
		for (const apiVersion of ALL_VERSIONS) {
			for (const spec of TRACK_SPECS) {
				for (const body of [{}, { async: false }]) {
					expect(typeFor({ spec, apiVersion, body, orgId: ASYNC_ORG_ID })).toBe(
						RateLimitType.Track,
					);
				}
			}
		}
	});

	test("checks with lock or send_event use SyncBalanceWrite on every version", () => {
		for (const apiVersion of ALL_VERSIONS) {
			for (const spec of CHECK_SPECS) {
				for (const body of [lockBody, { send_event: true }]) {
					expect(typeFor({ spec, apiVersion, body })).toBe(
						RateLimitType.SyncBalanceWrite,
					);
				}
				for (const body of [{}, { send_event: false }]) {
					expect(typeFor({ spec, apiVersion, body })).toBe(
						RateLimitType.CheckCustomerGet,
					);
				}
			}
		}
	});

	test("a request with no org resolved yet is judged by its body alone", () => {
		const getRouteGroup = (requestBody: Record<string, unknown>) =>
			getRateLimitRouteGroup({
				req: { method: "POST", path: "/v1/balances.track" },
				get: () => ({
					apiVersion: new ApiVersionClass(ApiVersion.V2_4),
					requestBody,
					features: [],
				}),
			} as unknown as Context<HonoEnv>).type;

		expect(getRouteGroup({})).toBe(RateLimitType.SyncBalanceWrite);
		expect(getRouteGroup({ async: true })).toBe(RateLimitType.Track);
	});

	test("balance updates, finalize and usage never use SyncBalanceWrite", () => {
		for (const spec of [
			"POST /v1/balances.update",
			"POST /v1/balances.finalize",
			"POST /v1/usage",
		]) {
			expect(
				typeFor({ spec, apiVersion: ApiVersion.V2_4, body: { async: false } }),
			).toBe(RateLimitType.Track);
		}
	});

	test("1000/s per customer under a 120k/min org cap, both in Redis and rejecting", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.SyncBalanceWrite]).toEqual({
			limit: 1000,
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
