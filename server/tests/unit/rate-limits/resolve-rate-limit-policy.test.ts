import { describe, expect, test } from "bun:test";
import { resolveRateLimitPolicy } from "@/internal/misc/rateLimiter/policies/resolveRateLimitPolicy.js";

/** Layer names in the order the middleware applies them: org, then customer. */
const layerNamesFor = (spec: string) => {
	const [method, path] = spec.split(" ");
	const { perOrg, perCustomer } = resolveRateLimitPolicy({ method, path });
	return [perOrg?.name, perCustomer?.name].filter(Boolean);
};

describe("resolveRateLimitPolicy", () => {
	test("classifies customer list endpoints into the list customers bucket", () => {
		expect(layerNamesFor("GET /v1/customers")).toEqual(["list_customers"]);
		expect(layerNamesFor("POST /v1/customers/list")).toEqual([
			"list_customers",
		]);
		expect(layerNamesFor("POST /v1/customers.list")).toEqual([
			"list_customers",
		]);
	});

	test("entities.list is 10/s per customer inside the org list cap", () => {
		const { perOrg, perCustomer } = resolveRateLimitPolicy({
			method: "POST",
			path: "/v1/entities.list",
		});
		const customerList = resolveRateLimitPolicy({
			method: "GET",
			path: "/v1/customers",
		});

		expect(perCustomer).toMatchObject({
			name: "entities_list",
			limit: 10,
			windowMs: 1000,
			skipWithoutCustomerId: true,
		});
		expect(perOrg).toBe(customerList.perOrg);
	});

	test("classifies track endpoints into the track buckets", () => {
		for (const spec of [
			"POST /v1/track",
			"POST /v1/track_tokens",
			"POST /v1/events",
			"POST /v1/balances.track_tokens",
		]) {
			expect(layerNamesFor(spec)).toEqual(["track_org", "track"]);
		}
	});

	test("classifies batch track endpoints into the batch track bucket", () => {
		expect(layerNamesFor("POST /v1/balances.batch_track")).toEqual([
			"batch_track",
		]);
		expect(layerNamesFor("POST /v1/balances.batch_track_tokens")).toEqual([
			"batch_track",
		]);
	});

	test("check fails open over the org cap; cached customer reads 429 on the same counters", () => {
		const check = resolveRateLimitPolicy({ method: "POST", path: "/v1/check" });
		const customerGet = resolveRateLimitPolicy({
			method: "GET",
			path: "/v1/customers/cus_123/entities/ent_123",
		});

		expect(layerNamesFor("POST /v1/balances.check")).toEqual([
			"check_org",
			"check",
		]);
		expect(layerNamesFor("GET /v1/customers/cus_123")).toEqual([
			"check_org",
			"check",
		]);
		expect(customerGet.perCustomer).toBe(check.perCustomer);
		expect(check.perOrg?.overLimit).toBe("degrade");
		expect(customerGet.perOrg?.overLimit).toBe("rejectAndQueueCreate");
	});

	test("classifies events and attach endpoints into their dedicated buckets", () => {
		expect(layerNamesFor("POST /v1/events/list")).toEqual(["events"]);
		expect(layerNamesFor("POST /v1/attach")).toEqual(["attach"]);
		expect(layerNamesFor("POST /v1/attach/preview")).toEqual(["general"]);
		expect(layerNamesFor("POST /v1/billing.preview_update")).toEqual([
			"general",
		]);
		expect(layerNamesFor("POST /v1/billing.open_customer_portal")).toEqual([
			"general",
		]);
	});

	test("classifies entities.get into its per-customer bucket under an org cap", () => {
		expect(layerNamesFor("POST /v1/entities.get")).toEqual([
			"entities_get_org",
			"customer_entities_get",
		]);
	});

	test("classifies log endpoints into their org-scoped logs bucket", () => {
		expect(layerNamesFor("POST /v1/logs.search")).toEqual(["logs"]);
		expect(
			resolveRateLimitPolicy({ method: "POST", path: "/v1/logs.query" }).perOrg,
		).toMatchObject({ name: "logs", limit: 10, windowMs: 1000 });
	});

	test("org caps count across pods on 60s windows", () => {
		for (const spec of [
			"POST /v1/track",
			"POST /v1/check",
			"POST /v1/entities.get",
		]) {
			const [method, path] = spec.split(" ");
			const { perOrg } = resolveRateLimitPolicy({ method, path });
			expect(perOrg?.counted ?? "allPods").toBe("allPods");
			expect(perOrg?.windowMs).toBe(60_000);
		}
	});

	test("falls back to the general bucket for uncategorized routes", () => {
		expect(layerNamesFor("GET /v1/products")).toEqual(["general"]);
	});
});
