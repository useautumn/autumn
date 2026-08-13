import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
} from "@autumn/shared";
import { buildBatchMigrationItemResponses } from "@/internal/migrations/v2/batchOperations/finalize/buildBatchMigrationItemResponses.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";

const meteredFeature = {
	internal_id: "fea_words_internal",
	id: "words",
	type: FeatureType.Metered,
	name: "Words",
} as Feature;

const booleanFeature = {
	internal_id: "fea_dashboard_internal",
	id: "dashboard",
	type: FeatureType.Boolean,
	name: "Dashboard",
} as Feature;

const features = [meteredFeature, booleanFeature];

const entitlement = ({
	feature,
	allowance,
	interval,
}: {
	feature: Feature;
	allowance: number | null;
	interval: EntInterval | null;
}) =>
	({
		id: `ent_${feature.id}`,
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		feature,
		allowance,
		interval,
		interval_count: interval ? 1 : null,
		allowance_type: allowance === null ? null : "fixed",
	}) as unknown as EntitlementWithFeature;

const fromProduct = {
	internal_id: "prod_pro_internal",
	id: "pro",
	prices: [],
	entitlements: [],
} as unknown as FullProductWithoutLicenses;

const plan: BatchMigrationExecutionPlan = {
	patches: [
		{
			opIndex: 0,
			scope: buildOperationScope({ internalProductId: "prod_pro_internal" }),
			fromProduct,
			addLicenseEntitlementOps: [],
			addEntitlementOps: [
				{
					entitlement: entitlement({
						feature: meteredFeature,
						allowance: 100,
						interval: EntInterval.Month,
					}),
					initialState: { granted: 100, tracksBalance: true, unlimited: false },
				},
				{
					entitlement: entitlement({
						feature: booleanFeature,
						allowance: null,
						interval: null,
					}),
					initialState: { granted: 0, tracksBalance: false, unlimited: false },
				},
			],
		},
	],
};

const customers = [
	{ internalId: "cus_1", id: "customer-1", name: "One", email: null },
	{ internalId: "cus_2", id: "customer-2", name: "Two", email: null },
];

const productState = {
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: 1_700_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
	action: "created" as const,
};

describe("buildBatchMigrationItemResponses", () => {
	test("synthesizes balance, flag and plan changes from inserted rows", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			customers,
			features,
			changedItems: [
				{
					internalCustomerId: "cus_1",
					customerProductId: "cp_1",
					planId: "pro",
					featureId: "words",
					granted: 100,
					unlimited: false,
					nextResetAt: 1_800_000_000_000,
					...productState,
				},
				{
					internalCustomerId: "cus_1",
					customerProductId: "cp_1",
					planId: "pro",
					featureId: "dashboard",
					granted: 0,
					unlimited: false,
					nextResetAt: null,
					...productState,
				},
			],
		});

		const response = responses.get("cus_1");
		expect(response?.customer_id).toBe("customer-1");

		// Metered add → balance change with the empty pre-state as previous.
		expect(response?.balance_changes).toEqual([
			{
				feature_id: "words",
				balance: {
					granted: 100,
					remaining: 100,
					usage: 0,
					unlimited: false,
					next_reset_at: 1_800_000_000_000,
				},
				previous_attributes: {
					granted: 0,
					remaining: 0,
					next_reset_at: null,
				},
			},
		]);

		// Boolean add → flag change, never a balance change.
		expect(response?.flag_changes).toEqual([
			{ action: "created", feature_id: "dashboard" },
		]);

		expect(response?.plan_changes).toHaveLength(1);
		expect(response?.plan_changes[0].action).toBe("updated");
		expect(
			response?.plan_changes[0].item_changes.map((c) => c.feature_id),
		).toEqual(["words", "dashboard"]);
	});

	test("a customer with no inserted rows gets an empty diff", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			customers,
			features,
			changedItems: [],
		});

		const response = responses.get("cus_2");
		expect(response?.customer_id).toBe("customer-2");
		expect(response?.plan_changes).toEqual([]);
		expect(response?.balance_changes).toEqual([]);
		expect(response?.flag_changes).toEqual([]);
	});

	test("multiple customer products on one plan each keep their own cycle", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			customers: [customers[0]],
			features,
			changedItems: [
				{
					internalCustomerId: "cus_1",
					customerProductId: "cp_a",
					planId: "pro",
					featureId: "words",
					granted: 100,
					unlimited: false,
					nextResetAt: 1_700_000_000_000,
					...productState,
				},
				{
					internalCustomerId: "cus_1",
					customerProductId: "cp_b",
					planId: "pro",
					featureId: "words",
					granted: 100,
					unlimited: false,
					nextResetAt: 1_900_000_000_000,
					...productState,
				},
			],
		});

		// One snapshot-bearing plan change PER customer product, each with its
		// own single item_change; the balance stays aggregated per feature.
		const response = responses.get("cus_1");
		expect(response?.plan_changes).toHaveLength(2);
		expect(response?.plan_changes[0].item_changes).toHaveLength(1);
		expect(response?.plan_changes[0].subscription?.plan_id).toBe("pro");
		expect(response?.balance_changes).toHaveLength(1);
	});
});
