/**
 * Contract: the delivery records a finalized page produces.
 *
 *   - one record per SUCCEEDED customer that actually changed, with one
 *     `updated` plan change PER customer product that gained items;
 *   - every plan change carries the real subscription/purchase snapshot
 *     (plan_id lives there — a payload without it can't say which plan),
 *     built from the inserted rows' lifecycle fields with no re-read;
 *   - one-off products snapshot as `purchase`, recurring as `subscription`;
 *   - customers with no inserted rows and skipped customers produce nothing.
 */

import { describe, expect, test } from "bun:test";
import {
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
import type { BatchMigrationInsertedItem } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { buildBatchMigrationWebhookRecords } from "@/internal/migrations/v2/batchOperations/finalize/buildBatchMigrationWebhookRecords/buildBatchMigrationWebhookRecords.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";

const meteredFeature = {
	internal_id: "fea_words_internal",
	id: "words",
	type: FeatureType.Metered,
	name: "Words",
} as Feature;

const features = [meteredFeature];

const entitlement = {
	id: "ent_words",
	internal_feature_id: meteredFeature.internal_id,
	feature_id: meteredFeature.id,
	feature: meteredFeature,
	allowance: 100,
	interval: EntInterval.Month,
	interval_count: 1,
	allowance_type: "fixed",
} as unknown as EntitlementWithFeature;

const fromProduct = ({ prices = [] }: { prices?: Price[] } = {}) =>
	({
		internal_id: "prod_pro_internal",
		id: "pro",
		prices,
		entitlements: [],
	}) as unknown as FullProductWithoutLicenses;

const oneOffPrice = {
	config: {
		type: PriceType.Fixed,
		interval: BillingInterval.OneOff,
		amount: 10,
	},
} as unknown as Price;

const buildPlan = ({
	prices,
}: {
	prices?: Price[];
} = {}): BatchMigrationExecutionPlan => ({
	patches: [
		{
			opIndex: 0,
			scope: buildOperationScope({ internalProductId: "prod_pro_internal" }),
			fromProduct: fromProduct({ prices }),
			addLicenseEntitlementOps: [],
			addEntitlementOps: [
				{
					entitlement,
					initialState: { granted: 100, tracksBalance: true, unlimited: false },
				},
			],
		},
	],
});

const plan = buildPlan();

const customer = ({ internalId, id }: { internalId: string; id: string }) => ({
	internalId,
	id,
	name: null,
	email: null,
});

const insertedItem = ({
	internalCustomerId,
	customerProductId,
	entityId = null,
}: {
	internalCustomerId: string;
	customerProductId: string;
	entityId?: string | null;
}): BatchMigrationInsertedItem => ({
	internalCustomerId,
	customerProductId,
	entityId,
	planId: "pro",
	featureId: "words",
	granted: 100,
	unlimited: false,
	nextResetAt: null,
	status: CusProductStatus.Active,
	startsAt: 1_700_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
});

describe("buildBatchMigrationWebhookRecords", () => {
	test("one record per changed customer, one snapshot-bearing change per product", () => {
		const records = buildBatchMigrationWebhookRecords({
			pageResult: {
				succeeded: [
					customer({ internalId: "cus_1", id: "customer-1" }),
					customer({ internalId: "cus_2", id: "customer-2" }),
				],
				skipped: [customer({ internalId: "cus_3", id: "customer-3" })],
				removedItems: [],
				insertedItems: [
					insertedItem({
						internalCustomerId: "cus_1",
						customerProductId: "cp_a",
					}),
					insertedItem({
						internalCustomerId: "cus_1",
						customerProductId: "cp_b",
					}),
					insertedItem({
						internalCustomerId: "cus_2",
						customerProductId: "cp_c",
					}),
				],
			},
			plan,
			features,
		});

		expect(records).toHaveLength(2);
		expect(records[0].customerId).toBe("customer-1");
		expect(records[0].internalCustomerId).toBe("cus_1");
		expect(records[0].entityId).toBeNull();
		expect(records[0].customerProductIds.sort()).toEqual(["cp_a", "cp_b"]);
		expect(records[0].planChanges).toHaveLength(2);
		expect(records[1].customerProductIds).toEqual(["cp_c"]);

		const change = records[0].planChanges[0];
		expect(change.action).toBe("updated");
		expect(change.subscription).toMatchObject({
			plan_id: "pro",
			status: "active",
			past_due: false,
			started_at: 1_700_000_000_000,
		});
		expect(
			change.item_changes.map((itemChange) => itemChange.feature_id),
		).toEqual(["words"]);
	});

	test("one-off products snapshot as purchase, not subscription", () => {
		const records = buildBatchMigrationWebhookRecords({
			pageResult: {
				succeeded: [customer({ internalId: "cus_1", id: "customer-1" })],
				skipped: [],
				removedItems: [],
				insertedItems: [
					insertedItem({
						internalCustomerId: "cus_1",
						customerProductId: "cp_a",
					}),
				],
			},
			plan: buildPlan({ prices: [oneOffPrice] }),
			features,
		});

		expect(records[0].planChanges[0].subscription).toBeUndefined();
		expect(records[0].planChanges[0].purchase).toMatchObject({
			plan_id: "pro",
			status: "active",
		});
	});

	test("entity-level products split into their own record carrying the entity", () => {
		const records = buildBatchMigrationWebhookRecords({
			pageResult: {
				succeeded: [customer({ internalId: "cus_1", id: "customer-1" })],
				skipped: [],
				removedItems: [],
				insertedItems: [
					insertedItem({
						internalCustomerId: "cus_1",
						customerProductId: "cp_customer_level",
					}),
					insertedItem({
						internalCustomerId: "cus_1",
						customerProductId: "cp_entity_level",
						entityId: "seat_1",
					}),
				],
			},
			plan,
			features,
		});

		expect(records).toHaveLength(2);
		const customerLevel = records.find((record) => record.entityId === null);
		const entityLevel = records.find((record) => record.entityId === "seat_1");
		expect(customerLevel?.customerProductIds).toEqual(["cp_customer_level"]);
		expect(entityLevel?.customerProductIds).toEqual(["cp_entity_level"]);
		expect(entityLevel?.planChanges).toHaveLength(1);
	});

	test("customers with no inserted rows and skipped customers produce nothing", () => {
		const records = buildBatchMigrationWebhookRecords({
			pageResult: {
				succeeded: [customer({ internalId: "cus_1", id: "customer-1" })],
				skipped: [customer({ internalId: "cus_2", id: "customer-2" })],
				insertedItems: [],
				removedItems: [],
			},
			plan,
			features,
		});

		expect(records).toEqual([]);
	});
});
