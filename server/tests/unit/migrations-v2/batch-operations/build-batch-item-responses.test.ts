import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
	type Price,
	PriceType,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanChangeFromFullProducts.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageResult,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { buildBatchMigrationItemResponses } from "@/internal/migrations/v2/batchOperations/finalize/buildBatchMigrationItemResponses.js";
import { buildBatchMigrationWebhookRecords } from "@/internal/migrations/v2/batchOperations/finalize/buildBatchMigrationWebhookRecords.js";
import { buildBatchMigrationPlanChanges } from "@/internal/migrations/v2/batchOperations/finalize/planChanges/buildBatchMigrationPlanChanges.js";
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

const messagesFeature = {
	internal_id: "fea_messages_internal",
	id: "messages",
	type: FeatureType.Metered,
	name: "Messages",
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
			removeEntitlementOps: [],
			replaceEntitlementOps: [],
			licenseEntitlementOps: [],
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

const replacePlan = ({
	fromEntitlement,
	toEntitlement,
}: {
	fromEntitlement: EntitlementWithFeature;
	toEntitlement: EntitlementWithFeature;
}): BatchMigrationExecutionPlan => ({
	patches: [
		{
			opIndex: 0,
			scope: buildOperationScope({ internalProductId: "prod_pro_internal" }),
			fromProduct,
			removeEntitlementOps: [],
			addEntitlementOps: [],
			licenseEntitlementOps: [],
			replaceEntitlementOps: [
				{
					fromEntitlement,
					entitlement: toEntitlement,
					initialState: {
						granted: toEntitlement.allowance ?? 0,
						tracksBalance: true,
						unlimited: false,
					},
				},
			],
		},
	],
});

const customers = [
	{ internalId: "cus_1", id: "customer-1", name: "One", email: null },
	{ internalId: "cus_2", id: "customer-2", name: "Two", email: null },
];

const lifecycle = {
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: 1_700_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
};

const toPageResult = ({
	succeeded = customers,
	skipped = [],
	insertedItems = [],
	removedItems = [],
	repointedProducts,
}: {
	succeeded?: typeof customers;
	skipped?: typeof customers;
	insertedItems?: BatchMigrationInsertedItem[];
	removedItems?: BatchMigrationRemovedItem[];
	repointedProducts?: BatchMigrationRepointedProduct[];
} = {}): BatchMigrationPageResult => ({
	succeeded,
	skipped,
	insertedItems,
	removedItems,
	...(repointedProducts ? { repointedProducts } : {}),
});

describe("buildBatchMigrationItemResponses", () => {
	test("synthesizes balance, flag and plan changes from inserted rows", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			features,
			pageResult: toPageResult({
				insertedItems: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						planId: "pro",
						featureId: "words",
						granted: 100,
						unlimited: false,
						nextResetAt: 1_800_000_000_000,
						...lifecycle,
					},
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						planId: "pro",
						featureId: "dashboard",
						granted: 0,
						unlimited: false,
						nextResetAt: null,
						...lifecycle,
					},
				],
			}),
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
		expect(response?.plan_changes[0].item_changes).toEqual([]);
		expect(response?.plan_changes[0].previous_attributes).toBeNull();
		expect(response?.plan_changes[0].plan_change).toEqual({
			previous_attributes: null,
			item_changes: expect.arrayContaining([
				expect.objectContaining({ feature_id: "words" }),
				expect.objectContaining({ feature_id: "dashboard" }),
			]),
		});
		expect(
			response?.plan_changes[0].plan_change?.item_changes.map(
				(change) => change.feature_id,
			),
		).toEqual(["words", "dashboard"]);
	});

	test("a replace pair diffs the deleted before-state against the created after-state", () => {
		const fromEntitlement = {
			...entitlement({
				feature: meteredFeature,
				allowance: 100,
				interval: EntInterval.Month,
			}),
			id: "ent_words_from",
		} as EntitlementWithFeature;
		const toEntitlement = {
			...entitlement({
				feature: meteredFeature,
				allowance: 200,
				interval: EntInterval.Month,
			}),
			id: "ent_words_to",
		} as EntitlementWithFeature;
		const rowFields = {
			internalCustomerId: "cus_1",
			customerProductId: "cp_1",
			planId: "pro",
		};
		const responses = buildBatchMigrationItemResponses({
			plan: replacePlan({ fromEntitlement, toEntitlement }),
			features,
			pageResult: toPageResult({
				succeeded: [customers[0]],
				insertedItems: [
					{
						...rowFields,
						featureId: "words",
						granted: 200,
						remaining: 160,
						unlimited: false,
						nextResetAt: 1_800_000_000_000,
						...lifecycle,
					},
				],
				removedItems: [
					{
						...rowFields,
						featureId: "words",
						entitlement: fromEntitlement,
						granted: 100,
						remaining: 60,
						unlimited: false,
						nextResetAt: 1_750_000_000_000,
						...lifecycle,
					},
				],
			}),
		});

		const response = responses.get("cus_1");
		expect(response?.balance_changes).toEqual([
			{
				feature_id: "words",
				balance: {
					granted: 200,
					remaining: 160,
					usage: 40,
					unlimited: false,
					next_reset_at: 1_800_000_000_000,
				},
				// usage is 40 on both sides, so the diff drops it.
				previous_attributes: {
					granted: 100,
					remaining: 60,
					next_reset_at: 1_750_000_000_000,
				},
			},
		]);

		expect(response?.plan_changes).toHaveLength(1);
		expect(response?.plan_changes[0].item_changes).toEqual([]);
		expect(response?.plan_changes[0].previous_attributes).toBeNull();
		expect(
			response?.plan_changes[0].plan_change?.previous_attributes,
		).toBeNull();
		expect(response?.plan_changes[0].plan_change?.item_changes).toEqual([
			expect.objectContaining({
				action: "deleted",
				feature_id: "words",
				item: expect.objectContaining({ included: 100 }),
			}),
			expect.objectContaining({
				action: "created",
				feature_id: "words",
				item: expect.objectContaining({ included: 200 }),
			}),
		]);
	});

	test("a pure remove emits a deleted item change but no balance change", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			features,
			pageResult: toPageResult({
				succeeded: [customers[0]],
				removedItems: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						planId: "pro",
						featureId: "words",
						entitlement: entitlement({
							feature: meteredFeature,
							allowance: 100,
							interval: EntInterval.Month,
						}),
						...lifecycle,
					},
				],
			}),
		});

		const response = responses.get("cus_1");
		expect(response?.balance_changes).toEqual([]);
		expect(response?.plan_changes[0].item_changes).toEqual([]);
		expect(
			response?.plan_changes[0].plan_change?.item_changes.map(
				(change) => change.action,
			),
		).toEqual(["deleted"]);
	});

	test("a removed boolean feature emits a deleted flag change", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			features,
			pageResult: toPageResult({
				succeeded: [customers[0]],
				removedItems: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						planId: "pro",
						featureId: "dashboard",
						entitlement: entitlement({
							feature: booleanFeature,
							allowance: null,
							interval: null,
						}),
						...lifecycle,
					},
				],
			}),
		});

		expect(responses.get("cus_1")?.flag_changes).toEqual([
			{ action: "deleted", feature_id: "dashboard" },
		]);
	});

	test("a customer with no inserted rows gets an empty diff", () => {
		const responses = buildBatchMigrationItemResponses({
			plan,
			features,
			pageResult: toPageResult(),
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
			features,
			pageResult: toPageResult({
				succeeded: [customers[0]],
				insertedItems: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_a",
						planId: "pro",
						featureId: "words",
						granted: 100,
						unlimited: false,
						nextResetAt: 1_700_000_000_000,
						...lifecycle,
					},
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_b",
						planId: "pro",
						featureId: "words",
						granted: 100,
						unlimited: false,
						nextResetAt: 1_900_000_000_000,
						...lifecycle,
					},
				],
			}),
		});

		// One snapshot-bearing plan change PER customer product, each with its
		// own single plan_change.item_change; the balance stays aggregated per feature.
		const response = responses.get("cus_1");
		expect(response?.plan_changes).toHaveLength(2);
		expect(response?.plan_changes[0].item_changes).toEqual([]);
		expect(response?.plan_changes[0].plan_change?.item_changes).toHaveLength(1);
		expect(response?.plan_changes[0].subscription?.plan_id).toBe("pro");
		expect(response?.balance_changes).toHaveLength(1);
	});

	test("item events and webhook records share plan changes for remove, replace, and mixed rows", () => {
		const insertedWord = {
			internalCustomerId: "cus_1",
			customerProductId: "cp_1",
			planId: "pro",
			featureId: "words",
			granted: 100,
			remaining: 80,
			unlimited: false,
			nextResetAt: 1_800_000_000_000,
			...lifecycle,
		};
		const insertedFlag = {
			...insertedWord,
			featureId: "dashboard",
			granted: 0,
			remaining: 0,
			nextResetAt: null,
		};
		// The deleted row carries the OLD definition — different content from
		// the minted add, so the replace surfaces instead of cancelling out.
		const removedWord = {
			internalCustomerId: "cus_1",
			customerProductId: "cp_1",
			planId: "pro",
			featureId: "words",
			entitlement: entitlement({
				feature: meteredFeature,
				allowance: 50,
				interval: EntInterval.Month,
			}),
			granted: 50,
			remaining: 30,
			unlimited: false,
			nextResetAt: 1_750_000_000_000,
			...lifecycle,
		};

		for (const pageResult of [
			{
				succeeded: [customers[0]],
				skipped: [],
				insertedItems: [],
				removedItems: [removedWord],
			},
			{
				succeeded: [customers[0]],
				skipped: [],
				insertedItems: [insertedWord],
				removedItems: [removedWord],
			},
			{
				succeeded: [customers[0]],
				skipped: [],
				insertedItems: [insertedWord, insertedFlag],
				removedItems: [removedWord],
			},
		]) {
			const eventPlanChanges = buildBatchMigrationItemResponses({
				plan,
				pageResult,
				features,
			}).get("cus_1")?.plan_changes;
			const webhookRecords = buildBatchMigrationWebhookRecords({
				pageResult,
				plan,
				features,
			});

			expect(webhookRecords).toHaveLength(1);
			expect(eventPlanChanges).toBeDefined();
			const [webhookRecord] = webhookRecords;
			if (!webhookRecord || !eventPlanChanges) {
				throw new Error("Expected finalize builders to produce plan changes");
			}
			expect(webhookRecord.planChanges).toEqual(eventPlanChanges);
		}
	});
});

describe("buildBatchMigrationPlanChanges", () => {
	test("a customer product with both a repoint and applied rows yields one combined plan change", () => {
		const fromWords = {
			...entitlement({
				feature: meteredFeature,
				allowance: 100,
				interval: EntInterval.Month,
			}),
			id: "ent_words_from",
		} as EntitlementWithFeature;
		const toWords = {
			...entitlement({
				feature: meteredFeature,
				allowance: 200,
				interval: EntInterval.Month,
			}),
			id: "ent_words_to",
		} as EntitlementWithFeature;

		const monthlyPrice = ({
			id,
			amount,
		}: {
			id: string;
			amount: number;
		}): Price =>
			({
				id,
				internal_product_id: "prod_pro_internal",
				proration_config: null,
				config: {
					type: PriceType.Fixed,
					interval: BillingInterval.Month,
					amount,
				},
			}) as unknown as Price;

		const catalogProduct = ({
			internalId,
			name,
			version,
			amount,
			messagesAllowance,
		}: {
			internalId: string;
			name: string;
			version: number;
			amount: number;
			messagesAllowance: number;
		}): FullProductWithoutLicenses =>
			({
				id: "pro",
				internal_id: internalId,
				name,
				version,
				description: null,
				is_add_on: false,
				is_default: false,
				group: "",
				env: AppEnv.Sandbox,
				org_id: "org_1",
				created_at: 1,
				archived: false,
				base_variant_id: null,
				config: { ignore_past_due: false },
				metadata: {},
				prices: [monthlyPrice({ id: `price_v${version}`, amount })],
				entitlements: [
					entitlement({
						feature: messagesFeature,
						allowance: messagesAllowance,
						interval: EntInterval.Month,
					}),
				],
			}) as unknown as FullProductWithoutLicenses;

		const fromVersion = catalogProduct({
			internalId: "prod_pro_v1",
			name: "Pro",
			version: 1,
			amount: 20,
			messagesAllowance: 50,
		});
		const toVersion = catalogProduct({
			internalId: "prod_pro_v2",
			name: "Pro Plus",
			version: 2,
			amount: 50,
			messagesAllowance: 500,
		});
		const combinedFeatures = [...features, messagesFeature];
		const catalog = buildPlanChangeFromFullProducts({
			from: { ...fromVersion, licenses: [] },
			to: { ...toVersion, licenses: [] },
			features: combinedFeatures,
		});

		const entries = buildBatchMigrationPlanChanges({
			plan: replacePlan({
				fromEntitlement: fromWords,
				toEntitlement: toWords,
			}),
			features: combinedFeatures,
			pageResult: toPageResult({
				succeeded: [customers[0]],
				insertedItems: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						planId: "pro",
						featureId: "words",
						granted: 200,
						unlimited: false,
						nextResetAt: 1_800_000_000_000,
						...lifecycle,
					},
				],
				removedItems: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						planId: "pro",
						featureId: "words",
						entitlement: fromWords,
						granted: 100,
						unlimited: false,
						nextResetAt: 1_750_000_000_000,
						...lifecycle,
					},
				],
				repointedProducts: [
					{
						internalCustomerId: "cus_1",
						customerProductId: "cp_1",
						fromProduct: fromVersion,
						toProduct: toVersion,
						...lifecycle,
					},
				],
			}),
		});

		expect(catalog?.price_change).toBeDefined();
		expect(catalog?.previous_attributes).toMatchObject({ name: "Pro" });
		expect(
			catalog?.item_changes.some((change) => change.feature_id === "messages"),
		).toBe(true);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			internalCustomerId: "cus_1",
			entityId: null,
			customerProductId: "cp_1",
		});

		const { planChange } = entries[0];
		expect(planChange.action).toBe("updated");
		expect(planChange.item_changes).toEqual([]);
		expect(planChange.previous_attributes).toBeNull();
		expect(planChange.plan_change?.previous_attributes).toEqual(
			catalog?.previous_attributes,
		);
		expect(planChange.plan_change?.price_change).toEqual(catalog?.price_change);
		expect(planChange.plan_change?.free_trial_change).toEqual(
			catalog?.free_trial_change,
		);
		expect(planChange.plan_change?.item_changes).not.toEqual(
			catalog?.item_changes,
		);
		expect(planChange.plan_change?.item_changes).toEqual([
			expect.objectContaining({
				action: "deleted",
				feature_id: "words",
				item: expect.objectContaining({ included: 100 }),
			}),
			expect.objectContaining({
				action: "created",
				feature_id: "words",
				item: expect.objectContaining({ included: 200 }),
			}),
		]);
	});
});
