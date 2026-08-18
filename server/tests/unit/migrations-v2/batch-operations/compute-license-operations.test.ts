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
import { computeBatchMigrationOperations } from "@/internal/migrations/v2/batchOperations/compute/operations/computeBatchMigrationOperations.js";
import { resolveLicenseCustomizeTransitions } from "@/internal/migrations/v2/batchOperations/compute/transitions/resolveLicenseCustomizeTransitions.js";
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
	licenses: [
		{
			product: {
				id: LICENSE_PLAN_ID,
				internal_id: "prod_internal_seat",
				entitlements: [],
				prices: [],
			},
		},
	],
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

describe("license transitions lower into operations", () => {
	const lower = ({
		entitlement,
		features,
	}: {
		entitlement: Entitlement;
		features: Feature[];
	}) => {
		const { links: licenseLinks, rejections } =
			resolveLicenseCustomizeTransitions({
				migration: buildMigration({ entitlement }),
				op,
				opIndex: 0,
				fromProduct,
				features,
			});
		const { licenseEntitlements } = computeBatchMigrationOperations({
			productTransitions: {
				basePrice: undefined,
				customerProduct: undefined,
				entitlementPrices: { transitions: [], added: [], deleted: [] },
				toProduct: fromProduct,
			},
			licenseLinks,
		});
		return { operations: licenseEntitlements, rejections };
	};

	test("lowers a non-resetting entitlement into an add operation", () => {
		const { operations, rejections } = lower({
			entitlement: booleanEntitlement,
			features: [dashboardFeature],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.map((operation) => operation.type)).toEqual([
			"repoint_license_pool",
			"add_license_entitlement",
		]);
		expect(operations[0]?.licensePlanId).toBe(LICENSE_PLAN_ID);
		const added = operations[1];
		if (added?.type !== "add_license_entitlement")
			throw new Error("expected a minted op");
		expect(added.initialState.tracksBalance).toBe(false);
	});

	test("lowers a resetting entitlement with a tracked balance", () => {
		const { operations, rejections } = lower({
			entitlement: meteredEntitlement,
			features: [messagesFeature],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.map((operation) => operation.type)).toEqual([
			"repoint_license_pool",
			"add_license_entitlement",
		]);
		const minted = operations[1];
		if (minted?.type !== "add_license_entitlement")
			throw new Error("expected a minted op");
		expect(minted.initialState.tracksBalance).toBe(true);
		expect(minted.initialState.granted).toBe(100);
	});
});
