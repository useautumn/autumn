import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getRateLimitType,
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
			getRateLimitType(createContext({ method: "POST", path: "/v1/events" })),
		).toBe(RateLimitType.Track);
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
		).toBe(RateLimitType.Attach);
		expect(
			getRateLimitType(
				createContext({ method: "POST", path: "/v1/billing.preview_update" }),
			),
		).toBe(RateLimitType.Attach);
		expect(
			getRateLimitType(
				createContext({
					method: "POST",
					path: "/v1/billing.open_customer_portal",
				}),
			),
		).toBe(RateLimitType.Attach);
	});

	test("falls back to the general bucket for uncategorized routes", () => {
		expect(
			getRateLimitType(createContext({ method: "GET", path: "/v1/products" })),
		).toBe(RateLimitType.General);
	});
});
