import {
	AllowanceType,
	type AppEnv,
	CollectionMethod,
	CusProductStatus,
	EntInterval,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import type { ShardContext } from "../../../src/internal/shard/types/shardContext.js";
import { subjectToKey } from "../../../src/internal/subjects/subjectToKey.js";
import { customerEntitlementStore } from "../../../src/sqlite/customerEntitlements/store/customerEntitlementStore.js";
import { customerProductStore } from "../../../src/sqlite/customerProducts/store/customerProductStore.js";
import { customerStore } from "../../../src/sqlite/customers/store/customerStore.js";
import { entitlementStore } from "../../../src/sqlite/entitlements/store/entitlementStore.js";
import { featureStore } from "../../../src/sqlite/features/store/featureStore.js";
import { productStore } from "../../../src/sqlite/products/store/productStore.js";

const CREATED_AT = 1_600_000_000_000;

export type SeedEntitlement = {
	featureId: string;
	balance: number;
	allowance?: number;
	adjustment?: number;
	usageAllowed?: boolean;
	usageLimit?: number | null;
	unlimited?: boolean;
	expiresAt?: number | null;
	looseGrant?: boolean;
	continuousFeature?: boolean;
	createdAt?: number;
};

export type SeededSubject = {
	internalCustomerId: string;
	customerEntitlementIds: string[];
};

const toFeatureRow = ({
	orgId,
	env,
	featureId,
	continuous,
}: {
	orgId: string;
	env: AppEnv;
	featureId: string;
	continuous: boolean;
}) => ({
	internal_id: `fi_${featureId}`,
	org_id: orgId,
	created_at: CREATED_AT,
	env,
	id: featureId,
	name: featureId,
	type: FeatureType.Metered,
	config: {
		filters: [],
		aggregate: { type: "count", property: null },
		usage_type: continuous
			? FeatureUsageType.Continuous
			: FeatureUsageType.Single,
	},
	archived: false,
	event_names: [],
});

export const seedSubject = ({
	ctx,
	orgId,
	env,
	customerId,
	entitlements,
	otherFeatureIds = [],
}: {
	ctx: ShardContext;
	orgId: string;
	env: AppEnv;
	customerId: string;
	entitlements: SeedEntitlement[];
	otherFeatureIds?: string[];
}): SeededSubject => {
	const internalCustomerId = `icus_${customerId}`;
	const internalProductId = `iprod_${customerId}`;
	const customerProductId = `cusprod_${customerId}`;

	const featureIds = [
		...new Set([
			...entitlements.map((entitlement) => entitlement.featureId),
			...otherFeatureIds,
		]),
	];
	featureStore.insertMany({
		ctx,
		rows: featureIds.map((featureId) =>
			toFeatureRow({
				orgId,
				env,
				featureId,
				continuous: entitlements.some(
					(entitlement) =>
						entitlement.featureId === featureId &&
						entitlement.continuousFeature === true,
				),
			}),
		),
	});

	productStore.insertMany({
		ctx,
		rows: [
			{
				internal_id: internalProductId,
				id: `plan_${customerId}`,
				name: `plan_${customerId}`,
				description: null,
				org_id: orgId,
				created_at: CREATED_AT,
				env,
				is_add_on: false,
				is_default: false,
				group: "",
				version: 1,
				version_slug: null,
				active: true,
				base_variant_id: null,
				archived: false,
				config: { ignore_past_due: false },
				metadata: {},
			},
		],
	});

	customerStore.insertMany({
		ctx,
		rows: [
			{
				internal_id: internalCustomerId,
				org_id: orgId,
				created_at: CREATED_AT,
				env,
				id: customerId,
				name: customerId,
			},
		],
	});

	customerProductStore.insertMany({
		ctx,
		rows: [
			{
				id: customerProductId,
				internal_customer_id: internalCustomerId,
				internal_product_id: internalProductId,
				internal_entity_id: null,
				created_at: CREATED_AT,
				updated_at: null,
				status: CusProductStatus.Active,
				canceled: false,
				starts_at: CREATED_AT,
				options: [],
				product_id: `plan_${customerId}`,
				collection_method: CollectionMethod.ChargeAutomatically,
				quantity: 1,
				is_custom: false,
				customer_id: customerId,
				api_semver: null,
				external_id: null,
				billing_version: "v1",
			},
		],
	});

	const customerEntitlementIds = entitlements.map(
		(_entitlement, index) => `ce_${customerId}_${index}`,
	);

	entitlementStore.insertMany({
		ctx,
		rows: entitlements.map((entitlement, index) => ({
			id: `ent_${customerId}_${index}`,
			created_at: CREATED_AT,
			internal_feature_id: `fi_${entitlement.featureId}`,
			internal_product_id: internalProductId,
			is_custom: false,
			allowance_type: entitlement.unlimited
				? AllowanceType.Unlimited
				: AllowanceType.Fixed,
			allowance: entitlement.allowance ?? entitlement.balance,
			interval: EntInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			pooled: false,
			org_id: orgId,
			feature_id: entitlement.featureId,
			usage_limit: entitlement.usageLimit ?? null,
			rollover: null,
		})),
	});

	customerEntitlementStore.insertMany({
		ctx,
		rows: entitlements.map((entitlement, index) => ({
			id: customerEntitlementIds[index],
			customer_product_id: entitlement.looseGrant ? null : customerProductId,
			entitlement_id: `ent_${customerId}_${index}`,
			internal_customer_id: internalCustomerId,
			internal_entity_id: null,
			internal_feature_id: `fi_${entitlement.featureId}`,
			unlimited: entitlement.unlimited ?? false,
			balance: entitlement.balance,
			created_at: (entitlement.createdAt ?? CREATED_AT) + index,
			next_reset_at: null,
			usage_allowed: entitlement.usageAllowed ?? false,
			separate_interval: false,
			is_pooled_balance: false,
			adjustment: entitlement.adjustment ?? 0,
			additional_balance: 0,
			entities: null,
			expires_at: entitlement.expiresAt ?? null,
			external_id: null,
			customer_id: customerId,
			feature_id: entitlement.featureId,
		})),
	});

	ctx.subjects.markResident({ key: subjectToKey({ orgId, env, customerId }) });

	return { internalCustomerId, customerEntitlementIds };
};
