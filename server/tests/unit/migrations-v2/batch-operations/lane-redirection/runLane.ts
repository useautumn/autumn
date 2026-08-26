import {
	AllowanceType,
	EntInterval,
	type Entitlement,
	EntitlementSchema,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProduct,
	type Price,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { CreatePlanItemParamsV1Input } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import { computeBatchMigration } from "@/internal/migrations/v2/batchOperations/compute/computeBatchMigration.js";
import { hashPlanItemArtifact } from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/hashPlanItemArtifact.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";

export const PREPARE_KEY = "ensure_prices_and_entitlements:update_plan";

export const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

export const dashboardFeature = {
	internal_id: "feat_dashboard",
	id: "dashboard",
	type: FeatureType.Boolean,
} as unknown as Feature;

export const creditsFeature = {
	internal_id: "feat_credits",
	id: "credits",
	type: FeatureType.CreditSystem,
} as unknown as Feature;

export const seatsFeature = {
	internal_id: "feat_seats",
	id: "seats",
	type: FeatureType.Metered,
} as unknown as Feature;

export const features = [
	messagesFeature,
	dashboardFeature,
	creditsFeature,
	seatsFeature,
];

export const entitlementRow = (
	overrides: Partial<Entitlement> & { feature?: Feature } = {},
): Entitlement => {
	const feature = overrides.feature ?? messagesFeature;
	return EntitlementSchema.parse({
		id: overrides.id ?? "ent_new",
		created_at: 0,
		internal_feature_id: feature.internal_id,
		internal_product_id: "prod_pro",
		is_custom: false,
		feature_id: feature.id,
		allowance_type:
			overrides.allowance_type !== undefined
				? overrides.allowance_type
				: feature.type === FeatureType.Boolean
					? null
					: AllowanceType.Fixed,
		allowance:
			overrides.allowance !== undefined
				? overrides.allowance
				: feature.type === FeatureType.Boolean
					? null
					: 100,
		interval:
			overrides.interval !== undefined
				? overrides.interval
				: feature.type === FeatureType.Boolean
					? null
					: EntInterval.Month,
		interval_count: overrides.interval_count ?? 1,
		pooled: overrides.pooled ?? false,
		entity_feature_id: overrides.entity_feature_id,
		rollover: overrides.rollover,
		carry_from_previous: overrides.carry_from_previous ?? false,
		usage_limit: overrides.usage_limit ?? null,
	});
};

export const fromEntitlement = (
	overrides: Partial<Entitlement> & { feature?: Feature } = {},
): EntitlementWithFeature => {
	const feature = overrides.feature ?? messagesFeature;
	return {
		...entitlementRow({ id: "ent_from", ...overrides, feature }),
		feature,
	};
};

export type PreparedAdd = {
	item: CreatePlanItemParamsV1Input;
	entitlement: Entitlement;
};

export const runLane = ({
	customize,
	fromEntitlements = [],
	fromPrices = [],
	preparedAdds = [],
}: {
	customize: {
		add_items?: CreatePlanItemParamsV1Input[];
		remove_items?: Array<Record<string, unknown>>;
	};
	fromEntitlements?: EntitlementWithFeature[];
	fromPrices?: Price[];
	preparedAdds?: PreparedAdd[];
}) => {
	const fromProduct = {
		id: "pro",
		internal_id: "prod_pro",
		version: 1,
		is_add_on: false,
		prices: fromPrices,
		entitlements: fromEntitlements,
		licenses: [],
	} as unknown as FullProduct;

	const migration = {
		id: "mig_lane",
		no_billing_changes: true,
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "pro" },
					customize,
				} as UpdatePlanOp,
			],
		},
		prepared_state:
			preparedAdds.length > 0
				? {
						[PREPARE_KEY]: {
							entitlements: preparedAdds.map((add) => add.entitlement),
							prices: [],
							artifacts: preparedAdds.map((add, itemIndex) => ({
								op_index: 0,
								kind: "add_item" as const,
								item_index: itemIndex,
								hash: hashPlanItemArtifact({ item: add.item }),
								internal_product_id: "prod_pro",
								entitlement_id: add.entitlement.id,
							})),
						},
					}
				: undefined,
	} as MigrationRuntime;

	const result = computeBatchMigration({
		migration,
		products: [fromProduct],
		features,
	});

	if (!result.computable) {
		return {
			computable: false as const,
			codes: result.rejections.map((rejection) => rejection.code),
			addIds: [] as string[],
			removeIds: [] as string[],
			removeBy: [] as Array<"definition" | "filter">,
			removeFrom: [] as unknown[],
			replaceFromIds: [] as string[],
			replaceToIds: [] as string[],
			replaceBy: [] as Array<"definition" | "filter">,
		};
	}

	const operations = result.plan.patches[0]?.operations;
	return {
		computable: true as const,
		codes: [] as string[],
		addIds:
			operations?.addEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			) ?? [],
		removeIds:
			operations?.removeEntitlements.flatMap((operation) =>
				operation.by === "definition"
					? [operation.entitlementPrice.entitlement.id]
					: [],
			) ?? [],
		removeBy:
			operations?.removeEntitlements.map((operation) => operation.by) ?? [],
		removeFrom:
			operations?.removeEntitlements.flatMap((operation) =>
				operation.by === "filter" ? [operation.from] : [],
			) ?? [],
		replaceFromIds:
			operations?.replaceEntitlements.flatMap((operation) =>
				operation.by === "definition"
					? [operation.fromEntitlementPrice.entitlement.id]
					: [],
			) ?? [],
		replaceToIds:
			operations?.replaceEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			) ?? [],
		replaceBy:
			operations?.replaceEntitlements.map((operation) => operation.by) ?? [],
	};
};
