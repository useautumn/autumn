import { describe, expect, test } from "bun:test";
import { listRateLimitPolicies } from "@/internal/misc/rateLimiter/policies/listRateLimitPolicies.js";

const findPolicy = ({
	id,
	orgs = {},
}: {
	id: string;
	orgs?: Record<string, { limits: Record<string, number> }>;
}) => {
	const policy = listRateLimitPolicies({ overrides: { orgs } }).find(
		(candidate) => candidate.id === id,
	);
	if (!policy) throw new Error(`no ${id} policy`);
	return policy;
};

describe("listRateLimitPolicies", () => {
	test("serialises a row's layers with defaults filled in and the real key shape", () => {
		expect(findPolicy({ id: "track" })).toMatchObject({
			routes: expect.arrayContaining(["POST /v1/track"]),
			perCustomer: {
				name: "track",
				limit: 10_000,
				windowMs: 1000,
				counted: "perPod",
				overLimit: "reject",
				key: "track:{orgId}:{env}:{customerId}",
			},
			perOrg: {
				name: "track_org",
				limit: 120_000,
				windowMs: 60_000,
				counted: "allPods",
				overLimit: "degrade",
				key: "track_org:{orgId}:{env}",
			},
		});
	});

	test("lists version limits beside the otherwise limit", () => {
		expect(findPolicy({ id: "customer_list" }).perOrg).toMatchObject({
			limit: 5,
			versionLimits: [
				{ upTo: "2.2.0", limit: 5 },
				{ upTo: "2.3.0", limit: 50 },
			],
		});
	});

	test("points a row at the earlier rows it shares a counter with", () => {
		expect(findPolicy({ id: "customer_list" }).sharesCounterWith).toEqual([]);
		expect(findPolicy({ id: "entity_list" }).sharesCounterWith).toEqual([
			"customer_list",
		]);
		expect(findPolicy({ id: "customer_get" }).sharesCounterWith).toEqual([
			"check",
		]);
	});

	test("joins each org's overrides by layer name", () => {
		const orgs = {
			org_a: { limits: { track_org: 300_000 } },
			"org-b": { limits: { track: 20_000, track_org: 240_000, attach: 5 } },
			org_c: { limits: { attach: 10 } },
		};

		expect(findPolicy({ id: "track", orgs }).overrides).toEqual([
			{ orgKey: "org_a", perOrg: 300_000 },
			{ orgKey: "org-b", perOrg: 240_000, perCustomer: 20_000 },
		]);
		expect(findPolicy({ id: "general", orgs }).overrides).toEqual([]);
	});
});
