import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
} from "@autumn/shared";
import { addRowsToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsThroughWorker/addRowsToMigrationPlan.js";
import type { AddWorkerRow } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsThroughWorker/types/addWorkerRow.js";
import { replaceRowsToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsThroughWorker/replaceRowsToMigrationPlan.js";
import type { ReplaceWorkerRow } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsThroughWorker/types/replaceWorkerRow.js";
import { repointRowsToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/repointCustomerProductsThroughWorker/repointRowsToMigrationPlan.js";
import type { RepointRow } from "@/internal/migrations/v2/batchOperations/actions/repointCustomerProductsThroughWorker/selectRepointRows.js";

const NOW = 1_700_000_000_000;

const messagesFeature = {
	internal_id: "fea_messages_internal",
	id: "messages",
	type: FeatureType.Metered,
	name: "Messages",
} as Feature;

const entitlement = ({
	id,
	allowance,
}: {
	id: string;
	allowance: number;
}): EntitlementWithFeature =>
	({
		id,
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		feature: messagesFeature,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		allowance_type: "fixed",
	}) as unknown as EntitlementWithFeature;

const lifecycle = {
	internalCustomerId: "cus_internal_1",
	customerProductId: "cus_prod_free",
	customerId: "customer_1",
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: NOW,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
	isPaidRecurring: false,
	billingCycleAnchor: null,
	subscriptionCycleAnchor: null,
	siblingResetCycleAnchor: null,
	resetCycleAnchor: NOW,
	nextResetAt: NOW + 30 * 86_400_000,
	ownerInternalEntityId: null,
	ownerEntityId: null,
	internalProductId: "prod_internal_free",
	productIsCustom: false,
	productLoadedByWorker: true,
	customerPriceIds: ["cus_price_base"],
};

const expectedProduct = {
	columns: {
		internal_product_id: "prod_internal_free",
		status: CusProductStatus.Active,
		is_custom: false,
	},
	customerPriceIds: ["cus_price_base"],
};

const replaceRow = (
	overrides: Partial<ReplaceWorkerRow> = {},
): ReplaceWorkerRow => {
	const to = entitlement({ id: "ent_messages_200", allowance: 200 });
	return {
		...lifecycle,
		customerEntitlementId: "cus_ent_messages",
		liveBalance: 40,
		liveNextResetAt: NOW,
		entitlementId: "ent_messages_100",
		replace: {
			by: "filter",
			from: { feature_id: "messages" },
			entitlement: to,
			initialState: { granted: 200, tracksBalance: true, unlimited: false },
		},
		customerEntitlementPatch: {
			balance: { type: "increment", amount: 100 },
		},
		...overrides,
	} as ReplaceWorkerRow;
};

describe("replaceRowsToMigrationPlan", () => {
	test("moves the grant onto the new entitlement, guarded by the one SQL read, and adds the delta", () => {
		const plan = replaceRowsToMigrationPlan({ rows: [replaceRow()] });
		expect(plan.ops).toEqual([
			{
				op: "update",
				table: "customerEntitlements",
				id: "cus_ent_messages",
				set: {
					entitlement_id: "ent_messages_200",
					internal_feature_id: "fea_messages_internal",
					feature_id: "messages",
					reset_cycle_anchor: lifecycle.resetCycleAnchor,
					next_reset_at: lifecycle.nextResetAt,
				},
				expect: { entitlement_id: "ent_messages_100" },
				expectProduct: expectedProduct,
			},
			{
				op: "increment",
				table: "customerEntitlements",
				id: "cus_ent_messages",
				add: { balance: 100 },
			},
		]);
		expect(plan.catalogRows.map(({ table }) => table)).toEqual([
			"entitlements",
			"features",
		]);
	});

	test("a set balance and an unlimited flip land in the update, with no increment", () => {
		const plan = replaceRowsToMigrationPlan({
			rows: [
				replaceRow({
					customerEntitlementPatch: {
						balance: { type: "set", amount: 50 },
						unlimited: false,
					},
				}),
			],
		});
		expect(plan.ops).toHaveLength(1);
		expect(plan.ops[0]).toMatchObject({
			op: "update",
			set: { balance: 50, unlimited: false },
		});
	});

	test("a zero delta sends no increment", () => {
		const plan = replaceRowsToMigrationPlan({
			rows: [
				replaceRow({
					customerEntitlementPatch: {
						balance: { type: "increment", amount: 0 },
					},
				}),
			],
		});
		expect(plan.ops.map(({ op }) => op)).toEqual(["update"]);
	});

	test("the new entitlement's catalog rows are sent once per entitlement", () => {
		const plan = replaceRowsToMigrationPlan({
			rows: [
				replaceRow({ customerEntitlementId: "a" }),
				replaceRow({ customerEntitlementId: "b" }),
			],
		});
		expect(plan.catalogRows).toHaveLength(2);
	});
});

const addRow = (overrides: Partial<AddWorkerRow> = {}): AddWorkerRow => ({
	...lifecycle,
	id: "cus_ent_new",
	add: {
		entitlement: entitlement({ id: "ent_messages_100", allowance: 100 }),
		initialState: { granted: 100, tracksBalance: true, unlimited: false },
	},
	featureGrants: {},
	...overrides,
});

describe("addRowsToMigrationPlan", () => {
	test("inserts the grant as the SQL path would, guarded by the feature's grants SQL read", () => {
		const plan = addRowsToMigrationPlan({
			rows: [
				addRow({
					featureGrants: { cus_ent_lifetime: "ent_messages_lifetime" },
				}),
			],
			now: NOW,
		});
		expect(plan.ops).toHaveLength(1);
		expect(plan.ops[0]).toMatchObject({
			op: "insert",
			table: "customerEntitlements",
			row: {
				id: "cus_ent_new",
				customer_product_id: "cus_prod_free",
				entitlement_id: "ent_messages_100",
				internal_feature_id: "fea_messages_internal",
				balance: 100,
				unlimited: false,
				created_at: NOW,
				reset_cycle_anchor: lifecycle.resetCycleAnchor,
				next_reset_at: lifecycle.nextResetAt,
				internal_entity_id: null,
			},
			expectFeatureGrants: { cus_ent_lifetime: "ent_messages_lifetime" },
			expectProduct: expectedProduct,
		});
	});

	test("a second add of the same feature on the same product expects the first one", () => {
		const plan = addRowsToMigrationPlan({
			rows: [
				addRow({ id: "cus_ent_monthly" }),
				addRow({ id: "cus_ent_yearly" }),
			],
			now: NOW,
		});
		expect(
			plan.ops.map((op) =>
				"expectFeatureGrants" in op ? op.expectFeatureGrants : null,
			),
		).toEqual([{}, { cus_ent_monthly: "ent_messages_100" }]);
	});

	test("an entity's product names the entity", () => {
		const plan = addRowsToMigrationPlan({
			rows: [
				addRow({
					entityId: "seat_1",
					ownerInternalEntityId: "ent_internal_seat_1",
					ownerEntityId: "seat_1",
				}),
			],
			now: NOW,
		});
		expect(plan.entityIds).toEqual(["seat_1"]);
	});
});

describe("repointRowsToMigrationPlan", () => {
	test("moves each product to the target version, guarded by the version SQL read", () => {
		const toProduct = {
			id: "pro",
			internal_id: "prod_internal_pro_v2",
			prices: [],
			entitlements: [entitlement({ id: "ent_messages_300", allowance: 300 })],
		} as unknown as FullProductWithoutLicenses;
		const row: RepointRow = {
			customerProductId: "cus_prod_pro",
			internalCustomerId: "cus_internal_1",
			entityId: null,
			status: CusProductStatus.Active,
			startsAt: NOW,
			canceledAt: null,
			endedAt: null,
			trialEndsAt: null,
			internalProductId: "prod_internal_pro_v1",
			productIsCustom: false,
			productLoadedByWorker: true,
			customerPriceIds: ["cus_price_pro_base"],
			ownerInternalEntityId: null,
			ownerEntityId: null,
		};
		const plan = repointRowsToMigrationPlan({ rows: [row], toProduct });
		expect(plan.ops).toEqual([
			{
				op: "update",
				table: "customerProducts",
				id: "cus_prod_pro",
				set: { internal_product_id: "prod_internal_pro_v2" },
				expectProduct: {
					columns: {
						internal_product_id: "prod_internal_pro_v1",
						status: CusProductStatus.Active,
						is_custom: false,
					},
					customerPriceIds: ["cus_price_pro_base"],
				},
			},
		]);
		expect(plan.catalogRows.map(({ table }) => table)).toEqual([
			"products",
			"entitlements",
			"features",
		]);
	});
});
