import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
} from "@autumn/shared";
import { toMigrationItemChanges } from "@/internal/migrations/v2/batchOperations/itemChanges/toMigrationItemChanges.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";

const wordsFeature = {
	internal_id: "fea_words_internal",
	id: "words",
	type: FeatureType.Metered,
	name: "Words",
} as Feature;

const seatsFeature = {
	internal_id: "fea_seats_internal",
	id: "seats",
	type: FeatureType.Metered,
	name: "Seats",
} as Feature;

const entitlement = ({
	id,
	feature,
	allowance,
}: {
	id: string;
	feature: Feature;
	allowance: number;
}): EntitlementWithFeature =>
	({
		id,
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		feature,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		allowance_type: "fixed",
	}) as unknown as EntitlementWithFeature;

const wordsEntitlement = entitlement({
	id: "ent_words",
	feature: wordsFeature,
	allowance: 100,
});
const seatsEntitlement = entitlement({
	id: "ent_seats",
	feature: seatsFeature,
	allowance: 5,
});

const proProduct = {
	internal_id: "prod_pro_internal",
	id: "pro",
	prices: [],
	entitlements: [],
} as unknown as FullProductWithoutLicenses;

const proV2Product = {
	...proProduct,
	internal_id: "prod_pro_v2_internal",
} as FullProductWithoutLicenses;

/** `pro` adds words; its `seat-license` link adds seats as a one-off plan. */
const plan: BatchMigrationExecutionPlan = {
	patches: [
		{
			opIndex: 0,
			scope: buildOperationScope({ internalProductId: "prod_pro_internal" }),
			fromProduct: proProduct,
			removeEntitlementOps: [],
			replaceEntitlementOps: [],
			addEntitlementOps: [
				{
					entitlement: wordsEntitlement,
					initialState: { granted: 100, tracksBalance: true, unlimited: false },
				},
			],
			licenseEntitlementOps: [
				{
					type: "add_license_entitlement",
					licensePlanId: "seat-license",
					planLicenseId: "lic_seats",
					licenseInternalProductId: "prod_seat_license_internal",
					isOneOff: true,
					entitlement: seatsEntitlement,
					initialState: { granted: 5, tracksBalance: true, unlimited: false },
				},
			],
		},
	],
};

const lifecycle = {
	customerProductId: "cp_1",
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: 1_700_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
};

/** Rows name their customer; the recorded change holds it as the map key. */
const insertedWords = {
	internalCustomerId: "cus_1",
	planId: "pro",
	featureId: "words",
	granted: 100,
	unlimited: false,
	nextResetAt: 1_800_000_000_000,
	...lifecycle,
};

const removedWords = {
	internalCustomerId: "cus_1",
	planId: "pro",
	featureId: "words",
	entitlement: entitlement({
		id: "ent_words_old",
		feature: wordsFeature,
		allowance: 50,
	}),
	granted: 50,
	remaining: 20,
	...lifecycle,
};

const { internalCustomerId: _created, ...createdWords } = insertedWords;
const { internalCustomerId: _deleted, ...deletedWords } = removedWords;

describe("toMigrationItemChanges", () => {
	test("an inserted row becomes a created change filled from the plan", () => {
		const changes = toMigrationItemChanges({
			insertedItems: [insertedWords],
			plan,
		});

		expect([...changes]).toEqual([
			[
				"cus_1",
				[
					{
						kind: "entitlement_created",
						...createdWords,
						entitlement: wordsEntitlement,
						isOneOff: false,
					},
				],
			],
		]);
	});

	test("a removed row keeps the live definition it carried", () => {
		const changes = toMigrationItemChanges({
			removedItems: [removedWords],
			plan,
		});

		expect(changes.get("cus_1")).toEqual([
			{
				kind: "entitlement_deleted",
				...deletedWords,
				isOneOff: false,
			},
		]);
	});

	test("a repointed customer product carries both product snapshots", () => {
		const changes = toMigrationItemChanges({
			repointedProducts: [
				{
					internalCustomerId: "cus_1",
					fromProduct: proProduct,
					toProduct: proV2Product,
					...lifecycle,
				},
			],
			plan,
		});

		expect(changes.get("cus_1")).toEqual([
			{
				kind: "customer_product_repointed",
				fromProduct: proProduct,
				toProduct: proV2Product,
				...lifecycle,
			},
		]);
	});

	test("a repointed license pool records only that it happened", () => {
		const changes = toMigrationItemChanges({
			repointedPoolCustomerIds: ["cus_1", "cus_2"],
		});

		expect([...changes]).toEqual([
			["cus_1", [{ kind: "license_pool_repointed" }]],
			["cus_2", [{ kind: "license_pool_repointed" }]],
		]);
	});

	test("a replace is a delete then a create on the same customer", () => {
		const changes = toMigrationItemChanges({
			insertedItems: [insertedWords],
			removedItems: [removedWords],
			plan,
		});

		expect(changes.get("cus_1")?.map((change) => change.kind)).toEqual([
			"entitlement_created",
			"entitlement_deleted",
		]);
	});

	test("a license row fills from its own plan, not the parent patch", () => {
		const changes = toMigrationItemChanges({
			insertedItems: [
				{
					...insertedWords,
					customerProductId: "cp_seat_assignment",
					planId: "seat-license",
					featureId: "seats",
					granted: 5,
				},
			],
			plan,
		});

		expect(changes.get("cus_1")?.[0]).toMatchObject({
			kind: "entitlement_created",
			planId: "seat-license",
			entitlement: seatsEntitlement,
			isOneOff: true,
		});
	});

	test("an inserted row whose feature the plan never added throws", () => {
		expect(() =>
			toMigrationItemChanges({
				insertedItems: [{ ...insertedWords, featureId: "seats" }],
				plan,
			}),
		).toThrow("batch-migration: missing entitlement snapshot for pro:seats");
	});

	test("a row whose plan is not in the patch throws", () => {
		expect(() =>
			toMigrationItemChanges({
				removedItems: [{ ...removedWords, planId: "enterprise" }],
				plan,
			}),
		).toThrow("batch-migration: missing plan snapshot for enterprise");
	});
});
