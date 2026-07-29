import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getRateLimitType,
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const createContext = ({
	method,
	path,
}: {
	method: string;
	path: string;
}): Context<HonoEnv> =>
	({
		req: {
			method,
			path,
		},
	}) as Context<HonoEnv>;

describe("getRateLimitType", () => {
	test("classifies customer list endpoints into the list customers bucket", () => {
		expect(
			getRateLimitType(createContext({ method: "GET", path: "/v1/customers" })),
		).toBe(RateLimitType.ListCustomers);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/customers/list" }),
			),
		).toBe(RateLimitType.ListCustomers);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/customers.list" }),
			),
		).toBe(RateLimitType.ListCustomers);
	});

	test("classifies track endpoints into the track bucket", () => {
		expect(
			getRateLimitType(createContext({ method: "POST", path: "/v1/track" })),
		).toBe(RateLimitType.Track);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/track_tokens" }),
			),
		).toBe(RateLimitType.Track);
		expect(
			getRateLimitType(createContext({ method: "POST", path: "/v1/events" })),
		).toBe(RateLimitType.Track);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/balances.track_tokens" }),
			),
		).toBe(RateLimitType.Track);
	});

	test("classifies batch track endpoints into the batch track bucket", () => {
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/balances.batch_track" }),
			),
		).toBe(RateLimitType.BatchTrack);
		expect(
			getRateLimitType(
				createContext({
					method: "POST",
					path: "/v1/balances.batch_track_tokens",
				}),
			),
		).toBe(RateLimitType.BatchTrack);
	});

	test("classifies check endpoints into the check bucket", () => {
		expect(
			getRateLimitType(createContext({ method: "POST", path: "/v1/check" })),
		).toBe(RateLimitType.Check);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/balances.check" }),
			),
		).toBe(RateLimitType.Check);
	});

	test("classifies cached customer reads into the check bucket", () => {
		expect(
			getRateLimitType(
				createContext({ method: "GET", path: "/v1/customers/cus_123" }),
			),
		).toBe(RateLimitType.Check);
		expect(
			getRateLimitType(
				createContext({
					method: "GET",
					path: "/v1/customers/cus_123/entities/ent_123",
				}),
			),
		).toBe(RateLimitType.Check);
	});

	test("classifies events and attach endpoints into their dedicated buckets", () => {
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/events/list" }),
			),
		).toBe(RateLimitType.Events);
		expect(
			getRateLimitType(createContext({ method: "POST", path: "/v1/attach" })),
		).toBe(RateLimitType.Attach);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/attach/preview" }),
			),
		).toBe(RateLimitType.General);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/billing.preview_update" }),
			),
		).toBe(RateLimitType.General);
		expect(
			getRateLimitType(
				createContext({
					method: "POST",
					path: "/v1/billing.open_customer_portal",
				}),
			),
		).toBe(RateLimitType.General);
	});

	test("classifies entities.get into its dedicated per-customer bucket", () => {
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/entities.get" }),
			),
		).toBe(RateLimitType.CustomerEntitiesGet);
	});

	test("classifies log endpoints into their org-scoped logs bucket", () => {
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/logs.search" }),
			),
		).toBe(RateLimitType.Logs);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/logs.query" }),
			),
		).toBe(RateLimitType.Logs);

		expect(RATE_LIMIT_CONFIGS[RateLimitType.Logs]).toMatchObject({
			name: "logs",
			limit: 10,
			windowMs: 1000,
			scope: RateLimitScope.Org,
		});
	});

	test("falls back to the general bucket for uncategorized routes", () => {
		expect(
			getRateLimitType(createContext({ method: "GET", path: "/v1/products" })),
		).toBe(RateLimitType.General);
	});
});
