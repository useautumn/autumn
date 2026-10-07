import { describe, expect, test } from "bun:test";
import { listRateLimitPolicies } from "@/internal/misc/rateLimiter/policySummaries/listRateLimitPolicies.js";

const listPolicies = ({
	orgs = {},
}: {
	orgs?: Record<string, { limits: Record<string, number> }>;
} = {}) => listRateLimitPolicies({ overrides: { orgs } });

const findPolicy = ({
	id,
	orgs,
}: {
	id: string;
	orgs?: Record<string, { limits: Record<string, number> }>;
}) => {
	const policy = listPolicies({ orgs }).find(
		(candidate) => candidate.id === id,
	);
	if (!policy) throw new Error(`no ${id} row`);
	return policy;
};

describe("listRateLimitPolicies", () => {
	test("one row per limit; org caps fold into their customer row and general is last", () => {
		const ids = listPolicies().map(({ id }) => id);

		expect(ids).not.toContain("track_org");
		expect(ids).not.toContain("check_org");
		expect(ids).not.toContain("entities_get_org");
		expect(ids).toContain("list_customers");
		expect(ids.at(-1)).toBe("general");
		expect(findPolicy({ id: "general" }).routes).toBe("*");
	});

	test("a customer limit carries its org cap, store, behaviour and key template", () => {
		expect(findPolicy({ id: "track" })).toMatchObject({
			routes: expect.arrayContaining(["POST /v1/track"]),
			perCustomer: {
				name: "track",
				limit: 10_000,
				windowMs: 1000,
				store: "memory",
				overLimit: "reject",
				key: "track:{orgId}:{env}:{customerId}",
			},
			perOrg: {
				name: "track_org",
				limit: 120_000,
				windowMs: 60_000,
				store: "redis",
				overLimit: "degrade",
				key: "track_org:{orgId}:{env}",
			},
		});
		expect(findPolicy({ id: "logs" })).toMatchObject({
			perCustomer: null,
			perOrg: { name: "logs", limit: 10 },
		});
	});

	test("version limits carry their own counter key", () => {
		expect(findPolicy({ id: "list_customers" }).perOrg).toMatchObject({
			limit: 5,
			key: "list_customers:{orgId}:{env}",
			versionLimits: expect.arrayContaining([
				{
					upTo: "2.3.0",
					limit: 50,
					key: "list_customers:{orgId}:{env}:v2.3.0",
				},
			]),
		});
	});

	test("customer reads are their own row on check's counters, rejecting at the cap", () => {
		const check = findPolicy({ id: "check" });
		const customerReads = findPolicy({ id: "check_2" });

		expect(check.routes).toContain("POST /v1/check");
		expect(check.perOrg).toMatchObject({
			name: "check_org",
			overLimit: "degrade",
		});
		expect(customerReads.routes).toContain("GET /v1/customers/:customer_id");
		expect(customerReads).toMatchObject({
			type: "check",
			sharesCounterWith: ["check"],
			perCustomer: { name: "check", store: "memory" },
			perOrg: { name: "check_org", overLimit: "reject" },
		});
	});

	test("a row that reuses another row's counter names it", () => {
		expect(findPolicy({ id: "entities_list" }).sharesCounterWith).toEqual([
			"list_customers",
		]);
		expect(findPolicy({ id: "list_customers" }).sharesCounterWith).toEqual([]);
	});

	test("joins each org's overrides by type", () => {
		const orgs = {
			org_a: { limits: { track_org: 300_000 } },
			"org-b": { limits: { track: 20_000, track_org: 240_000, attach: 5 } },
		};

		expect(findPolicy({ id: "track", orgs }).overrides).toEqual([
			{ orgKey: "org_a", perOrg: 300_000, perCustomer: undefined },
			{ orgKey: "org-b", perOrg: 240_000, perCustomer: 20_000 },
		]);
		expect(findPolicy({ id: "general", orgs }).overrides).toEqual([]);
	});
});
