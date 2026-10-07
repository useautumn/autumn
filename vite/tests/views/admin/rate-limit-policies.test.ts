import { describe, expect, test } from "bun:test";
import {
	formatLimit,
	formatPolicyLabel,
	formatVersionLimits,
} from "@/views/admin/rate-limits/formatRateLimit";
import { groupConditionalPolicies } from "@/views/admin/rate-limits/groupConditionalPolicies";
import {
	withOverride,
	withoutOverrides,
} from "@/views/admin/rate-limits/rateLimitOverrideEdits";
import type {
	RateLimitLayerSummary,
	RateLimitPolicySummary,
} from "@/views/admin/rate-limits/rateLimitTypes";

const layer = (
	overrides: Partial<RateLimitLayerSummary>,
): RateLimitLayerSummary => ({
	name: "track",
	limit: 10_000,
	versionLimits: [],
	windowMs: 1000,
	counted: "allPods",
	overLimit: "reject",
	skipWithoutCustomerId: false,
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
	test("nests a when row under the plain row with the same routes", () => {
		const trackSync = policy({
			id: "track_sync",
			when: { minVersion: "2.5.0", body: { async: false } },
		});
		const track = policy({});
		const general = policy({ id: "general", routes: "*" });

		expect(
			groupConditionalPolicies({ policies: [trackSync, track, general] }),
		).toEqual([
			{ policy: track, conditional: [trackSync] },
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
});
