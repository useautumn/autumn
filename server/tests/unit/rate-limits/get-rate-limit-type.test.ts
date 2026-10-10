import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getRateLimitRouteGroup,
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
		get: () => undefined,
	}) as unknown as Context<HonoEnv>;

describe("getRateLimitRouteGroup", () => {
	test("classifies customer list endpoints into the list customers bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "GET", path: "/v1/customers" }),
			),
		).toMatchObject({ type: RateLimitType.ListCustomers });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/customers/list" }),
			),
		).toMatchObject({ type: RateLimitType.ListCustomers });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/customers.list" }),
			),
		).toMatchObject({ type: RateLimitType.ListCustomers });
	});

	test("classifies entities.create into its own 200/s org bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/entities.create" }),
			),
		).toMatchObject({ type: RateLimitType.EntitiesCreateOrg });
		expect(RATE_LIMIT_CONFIGS[RateLimitType.EntitiesCreateOrg]).toMatchObject({
			limit: 200,
			windowMs: 1000,
			scope: RateLimitScope.Org,
			store: "redis",
		});
	});

	test("keeps get_or_create reads in the check bucket; creations have their own org counter", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/customers.get_or_create" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
		expect(RATE_LIMIT_CONFIGS[RateLimitType.CustomerCreateOrg]).toMatchObject({
			limit: 200,
			windowMs: 1000,
			scope: RateLimitScope.Org,
		});
	});

	test("classifies entities.list into its dedicated bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/entities.list" }),
			),
		).toMatchObject({ type: RateLimitType.EntitiesList });
	});

	test("limits entities.list to 10 requests per customer per second", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.EntitiesList]).toMatchObject({
			limit: 10,
			windowMs: 1000,
			scope: RateLimitScope.Customer,
		});
	});

	test("retains the org list cap around entities.list", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.EntitiesList].orgLimit).toBe(
			RateLimitType.ListCustomers,
		);
	});

	test("classifies track endpoints into the track bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/track" }),
			),
		).toMatchObject({ type: RateLimitType.Track });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/track_tokens" }),
			),
		).toMatchObject({ type: RateLimitType.Track });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/events" }),
			),
		).toMatchObject({ type: RateLimitType.Track });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/balances.track_tokens" }),
			),
		).toMatchObject({ type: RateLimitType.Track });
	});

	test("classifies batch track endpoints into the batch track bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/balances.batch_track" }),
			),
		).toMatchObject({ type: RateLimitType.BatchTrack });
		expect(
			getRateLimitRouteGroup(
				createContext({
					method: "POST",
					path: "/v1/balances.batch_track_tokens",
				}),
			),
		).toMatchObject({ type: RateLimitType.BatchTrack });
	});

	test("classifies check endpoints into the check bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/check" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/balances.check" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
	});

	test("classifies customer reads and creates into the check bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "GET", path: "/v1/customers/cus_123" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
		expect(
			getRateLimitRouteGroup(
				createContext({
					method: "GET",
					path: "/v1/customers/cus_123/entities/ent_123",
				}),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/customers.get" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/customers" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/customers.get_or_create" }),
			),
		).toMatchObject({ type: RateLimitType.CheckCustomerGet });
	});

	test("classifies events and attach endpoints into their dedicated buckets", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/events/list" }),
			),
		).toMatchObject({ type: RateLimitType.Events });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/attach" }),
			),
		).toMatchObject({ type: RateLimitType.Attach });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/attach/preview" }),
			),
		).toMatchObject({ type: RateLimitType.General });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/billing.preview_update" }),
			),
		).toMatchObject({ type: RateLimitType.General });
		expect(
			getRateLimitRouteGroup(
				createContext({
					method: "POST",
					path: "/v1/billing.open_customer_portal",
				}),
			),
		).toMatchObject({ type: RateLimitType.General });
	});

	test("classifies entities.get into its dedicated per-customer bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/entities.get" }),
			),
		).toMatchObject({ type: RateLimitType.CustomerEntitiesGet });
	});

	test("classifies log endpoints into their org-scoped logs bucket", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/logs.search" }),
			),
		).toMatchObject({ type: RateLimitType.Logs });
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "POST", path: "/v1/logs.query" }),
			),
		).toMatchObject({ type: RateLimitType.Logs });

		expect(RATE_LIMIT_CONFIGS[RateLimitType.Logs]).toMatchObject({
			limit: 10,
			windowMs: 1000,
			scope: RateLimitScope.Org,
		});
	});

	test("falls back to the general bucket for uncategorized routes", () => {
		expect(
			getRateLimitRouteGroup(
				createContext({ method: "GET", path: "/v1/products" }),
			),
		).toMatchObject({ type: RateLimitType.General });
	});
});
