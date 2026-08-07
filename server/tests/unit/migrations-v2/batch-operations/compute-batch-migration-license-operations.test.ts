import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type Entitlement,
	type Feature,
	FeatureType,
	type FullProduct,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computeBatchMigrationLicenseOperations } from "@/internal/migrations/v2/batchOperations/compute/operations/computeBatchMigrationLicenseOperations.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";

const PARENT_INTERNAL_ID = "prod_internal_pro";
const LICENSE_PLAN_ID = "dev-seat";
const PREPARE_KEY = "ensure_plan_licenses:update_plan";

const dashboardFeature = {
	internal_id: "feat_internal_dashboard",
	id: "dashboard",
	type: FeatureType.Boolean,
} as unknown as Feature;

const messagesFeature = {
	internal_id: "feat_internal_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const booleanEntitlement = {
	id: "ent_dashboard",
	created_at: 0,
	internal_product_id: "prod_internal_seat",
	internal_feature_id: dashboardFeature.internal_id,
	feature_id: dashboardFeature.id,
	allowance_type: null,
	allowance: null,
	interval: null,
} as unknown as Entitlement;

const meteredEntitlement = {
	id: "ent_messages",
	created_at: 0,
	internal_product_id: "prod_internal_seat",
	internal_feature_id: messagesFeature.internal_id,
	feature_id: messagesFeature.id,
	allowance_type: AllowanceType.Fixed,
	allowance: 100,
	interval: EntInterval.Month,
	interval_count: 1,
} as unknown as Entitlement;

const fromProduct = {
	id: "pro",
	internal_id: PARENT_INTERNAL_ID,
} as unknown as FullProduct;

const buildMigration = ({
	entitlement,
}: {
	entitlement: Entitlement;
}): MigrationRuntime =>
	({
		prepared_state: {
			[PREPARE_KEY]: {
				planLicenses: [],
				entitlements: [entitlement],
				artifacts: [
					{
						op_index: 0,
						license_plan_id: LICENSE_PLAN_ID,
						item_index: 0,
						hash: "hash_1",
						parent_internal_product_id: PARENT_INTERNAL_ID,
						license_internal_product_id: "prod_internal_seat",
						is_one_off: false,
						plan_license_id: "plan_lic_1",
						entitlement_id: entitlement.id,
						internal_feature_id: entitlement.internal_feature_id,
						base_item_refs: [],
					},
				],
			},
		},
	}) as unknown as MigrationRuntime;

const op: UpdatePlanOp = {
	type: "update_plan",
	plan_filter: { plan_id: "pro" },
	customize: {
		upsert_licenses: [{ license_plan_id: LICENSE_PLAN_ID }],
	},
} as unknown as UpdatePlanOp;

describe("computeBatchMigrationLicenseOperations", () => {
	test("lowers a non-resetting entitlement into an add operation", () => {
		const { operations, rejections } = computeBatchMigrationLicenseOperations({
			migration: buildMigration({ entitlement: booleanEntitlement }),
			op,
			opIndex: 0,
			fromProduct,
			features: [dashboardFeature],
		});

		expect(rejections).toHaveLength(0);
		expect(operations).toHaveLength(1);
		expect(operations[0]?.licensePlanId).toBe(LICENSE_PLAN_ID);
		expect(operations[0]?.initialState.tracksBalance).toBe(false);
	});

	test("rejects a resetting entitlement instead of inserting a row that never resets", () => {
		const { operations, rejections } = computeBatchMigrationLicenseOperations({
			migration: buildMigration({ entitlement: meteredEntitlement }),
			op,
			opIndex: 0,
			fromProduct,
			features: [messagesFeature],
		});

		expect(operations).toHaveLength(0);
		expect(rejections).toHaveLength(1);
		expect(rejections[0]?.code).toBe("resetting_license_entitlement");
		expect(rejections[0]?.details).toMatchObject({
			licensePlanId: LICENSE_PLAN_ID,
			featureId: messagesFeature.id,
		});
	});
});
