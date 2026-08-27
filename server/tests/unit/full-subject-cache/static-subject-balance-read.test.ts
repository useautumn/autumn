import { describe, expect, test } from "bun:test";
import type { UsageWindow } from "@autumn/shared";
import type { ChainableCommander } from "ioredis";
import {
	appendCachedFeatureBalanceReads,
	parseCachedFeatureBalanceHashReads,
	parseCachedFeatureBalanceReads,
} from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";

describe("static subject live-balance read", () => {
	test("adds only live balance fields after the static guards", () => {
		const calls: unknown[][] = [];
		const pipeline = {
			hmget: (...args: unknown[]) => {
				calls.push(args);
				return pipeline;
			},
		} as unknown as ChainableCommander;

		appendCachedFeatureBalanceReads({
			pipeline,
			orgId: "org_1",
			env: "sandbox",
			customerId: "customer_1",
			read: {
				featureIds: ["messages"],
				customerEntitlementIdsByFeatureId: {
					messages: ["cus_ent_1", "cus_ent_2"],
				},
				includeAggregated: true,
				usageWindowFeatureIds: new Set(["messages"]),
			},
		});

		expect(calls).toEqual([
			[
				"{customer_1}:org_1:sandbox:full_subject:shared_balances:messages",
				"cus_ent_1",
				"cus_ent_2",
				"_aggregated",
				"_usage_windows",
			],
		]);
	});

	test("parses fresh balances, aggregation, and usage windows", () => {
		const usageWindows = [
			{
				feature_id: "messages",
				usage: 4,
			} as UsageWindow,
		];
		const outcome = parseCachedFeatureBalanceReads({
			results: [
				[
					null,
					[
						JSON.stringify({
							id: "cus_ent_1",
							feature_id: "messages",
							balance: 12,
						}),
						JSON.stringify({ balance: 12 }),
						JSON.stringify(usageWindows),
					],
				],
			],
			read: {
				featureIds: ["messages"],
				customerEntitlementIdsByFeatureId: {
					messages: ["cus_ent_1"],
				},
				includeAggregated: true,
				usageWindowFeatureIds: new Set(["messages"]),
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.value[0]?.balances[0]?.balance).toBe(12);
		expect(outcome.value[0]?.aggregated?.balance).toBe(12);
		expect(outcome.value[0]?.usageWindows).toEqual(usageWindows);
	});

	test("rejects an absent authoritative balance field", () => {
		const outcome = parseCachedFeatureBalanceReads({
			results: [[null, [null]]],
			read: {
				featureIds: ["messages"],
				customerEntitlementIdsByFeatureId: {
					messages: ["cus_ent_1"],
				},
				includeAggregated: false,
			},
		});

		expect(outcome).toEqual({
			kind: "missing",
			reason: "batch_field_null:messages:cus_ent_1",
		});
	});

	test("parses feature-scoped balance hashes without reading the full subject", () => {
		const outcome = parseCachedFeatureBalanceHashReads({
			results: [
				[
					null,
					{
						cus_ent_1: JSON.stringify({
							id: "cus_ent_1",
							feature_id: "messages",
							balance: 8,
						}),
						stale_entitlement: JSON.stringify({ balance: 999 }),
					},
				],
			],
			read: {
				featureIds: ["messages"],
				customerEntitlementIdsByFeatureId: {
					messages: ["cus_ent_1"],
				},
				includeAggregated: false,
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.value[0]?.balances).toHaveLength(1);
		expect(outcome.value[0]?.balances[0]?.balance).toBe(8);
	});
});
