import { describe, expect, test } from "bun:test";
import {
	formatLimit,
	formatPolicyLabel,
	formatVersionLimits,
} from "@/views/admin/rate-limits/formatRateLimit";
import { groupConditionalPolicies } from "@/views/admin/rate-limits/groupConditionalPolicies";
import {
	listEndpointPolicies,
	toEndpointKey,
} from "@/views/admin/rate-limits/rateLimitEndpoints";
import {
	withEndpointOverride,
	withOverride,
	withoutEndpointOverride,
	withoutOverrides,
} from "@/views/admin/rate-limits/rateLimitOverrideEdits";
import type {
	RateLimitLayerSummary,
	RateLimitOverridesView,
	RateLimitPolicySummary,
} from "@/views/admin/rate-limits/rateLimitTypes";

const layer = (
	overrides: Partial<RateLimitLayerSummary>,
): RateLimitLayerSummary => ({
	name: "track",
	limit: 10_000,
	versionLimits: [],
	windowMs: 1000,
	store: "redis",
	overLimit: "reject",
	key: "track:{orgId}:{env}:{customerId}",
	...overrides,
});

const policy = (
	overrides: Partial<RateLimitPolicySummary>,
): RateLimitPolicySummary => ({
	id: "track",
	routes: ["POST /v1/track"],
	perOrg: null,
	perCustomer: layer({}),
	sharesCounterWith: [],
	overrides: [],
	...overrides,
});

describe("rate-limit policies page", () => {
	test("nests a row under the later row whose routes cover it", () => {
		const trackSync = policy({ id: "track_sync" });
		const checkWrite = policy({
			id: "check_write",
			routes: ["POST /v1/check"],
		});
		const track = policy({ routes: ["POST /v1/track", "POST /v1/events"] });
		const check = policy({ id: "check", routes: ["POST /v1/check"] });
		const unrouted = policy({ id: "sync_balance_write", routes: [] });
		const general = policy({ id: "general", routes: "*" });

		expect(
			groupConditionalPolicies({
				policies: [trackSync, checkWrite, track, check, unrouted, general],
			}),
		).toEqual([
			{ policy: track, conditional: [trackSync] },
			{ policy: check, conditional: [checkWrite] },
			{ policy: unrouted, conditional: [] },
			{ policy: general, conditional: [] },
		]);
	});

	test("formats limits, labels and version limits that differ from the default", () => {
		expect(formatLimit({ limit: 120_000, windowMs: 60_000 })).toBe("120k/min");
		expect(formatLimit({ limit: 30, windowMs: 60_000 })).toBe("30/min");
		expect(formatPolicyLabel("customer_list")).toBe("Customer list");
		expect(formatPolicyLabel("general")).toBe("Everything else");
		expect(
			formatVersionLimits({
				layer: layer({
					limit: 5,
					versionLimits: [
						{ upTo: "2.2.0", limit: 5, key: "k:v2.2.0" },
						{ upTo: "2.3.0", limit: 50, key: "k:v2.3.0" },
					],
				}),
			}),
		).toEqual(["2.3 · 50/s"]);
	});

	test("adds an override and drops the org once its last one is removed", () => {
		const orgs = withOverride({
			orgs: { org_a: { limits: { attach: 10 } } },
			orgKey: "org_a",
			layerName: "track_org",
			value: 300_000,
		});
		expect(orgs).toEqual({
			org_a: { limits: { attach: 10, track_org: 300_000 } },
		});
		expect(
			withoutOverrides({ orgs, orgKey: "org_a", layerNames: ["track_org"] }),
		).toEqual({ org_a: { limits: { attach: 10 } } });
		expect(
			withoutOverrides({
				orgs,
				orgKey: "org_a",
				layerNames: ["attach", "track_org"],
			}),
		).toEqual({});
	});

	test("endpoint overrides sit beside group limits and the org drops with the last of either", () => {
		const blocked = { limit: 0, windowMs: 1000 };
		const orgs = withEndpointOverride({
			orgs: { org_a: { limits: { attach: 10 } } },
			orgKey: "org_a",
			endpoint: "POST /v1/entities.delete",
			override: blocked,
		});
		expect(orgs).toEqual({
			org_a: {
				limits: { attach: 10 },
				endpoints: { "POST /v1/entities.delete": blocked },
			},
		});
		expect(
			withoutOverrides({ orgs, orgKey: "org_a", layerNames: ["attach"] }),
		).toEqual({
			org_a: { limits: {}, endpoints: { "POST /v1/entities.delete": blocked } },
		});
		expect(
			withoutEndpointOverride({
				orgs,
				orgKey: "org_a",
				endpoint: "POST /v1/entities.delete",
			}),
		).toEqual({ org_a: { limits: { attach: 10 } } });
		expect(
			withoutEndpointOverride({
				orgs: { org_a: { limits: {}, endpoints: { "GET /v1/x": blocked } } },
				orgKey: "org_a",
				endpoint: "GET /v1/x",
			}),
		).toEqual({});
	});

	test("normalises typed endpoints and groups overrides by endpoint", () => {
		expect(toEndpointKey("post  /v1/entities.delete")).toBe(
			"POST /v1/entities.delete",
		);
		expect(toEndpointKey("/v1/entities.delete")).toBeNull();
		expect(toEndpointKey("POST /entities.delete")).toBeNull();

		const view = {
			orgs: {
				org_a: {
					limits: {},
					endpoints: { "POST /v1/track": { limit: 5, windowMs: 1000 } },
				},
				org_b: {
					limits: {},
					endpoints: {
						"POST /v1/track": { limit: 0, windowMs: 1000 },
						"POST /v1/attach": { limit: 9, windowMs: 60_000 },
					},
				},
			},
		} as unknown as RateLimitOverridesView;
		expect(listEndpointPolicies({ view })).toEqual([
			{
				endpoint: "POST /v1/attach",
				overrides: [{ orgKey: "org_b", limit: 9, windowMs: 60_000 }],
			},
			{
				endpoint: "POST /v1/track",
				overrides: [
					{ orgKey: "org_a", limit: 5, windowMs: 1000 },
					{ orgKey: "org_b", limit: 0, windowMs: 1000 },
				],
			},
		]);
	});
});
