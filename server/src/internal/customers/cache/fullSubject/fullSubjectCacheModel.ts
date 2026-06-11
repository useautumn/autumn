import {
	CusProductSchema,
	CustomerPriceSchema,
	CustomerSchema,
	EntitlementWithFeatureSchema,
	EntityAggregationsSchema,
	EntitySchema,
	FreeTrialSchema,
	InvoiceSchema,
	MigrationItemRunSchema,
	type NormalizedFullSubject,
	PriceSchema,
	ProductSchema,
	SubjectFlagSchema,
	SubscriptionSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

// `usage_windows` is omitted alongside balances: counters live in the
// per-feature balance hashes (`_usage_windows` field) and would be instantly
// stale if serialized into the subject view.
export type CachedFullSubject = Omit<
	NormalizedFullSubject,
	"customer_entitlements" | "usage_windows"
> & {
	_schemaVersion: number;
	_cachedAt: number;
	meteredFeatures: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	/** Features with an armed windowed cap (customer + entity usage_limits);
	 *  may include features with no entitlements, so it cannot be derived from
	 *  customerEntitlementIdsByFeatureId. Drives `_usage_windows` reads,
	 *  writes, and invalidation. Optional: cache entries written before usage
	 *  windows existed don't carry it (treat as []). */
	usageWindowFeatureIds?: string[];
	subjectViewEpoch: number;
};

export const FULL_SUBJECT_CACHE_SCHEMA_VERSION = 2;

/**
 * Schema mirror of `CachedFullSubject` used by the cache-hole-filling walker
 * ({@link normalizeFromSchema}) to locate nullable positions in cached
 * payloads. Not a validator — runtime type above is the source of truth.
 *
 * Sub-shapes intentionally reuse existing shared schemas (CusProductSchema
 * mirrors DbCustomerProduct, etc.). Mismatches at non-nullable positions
 * are harmless: the walker only fills undefined at nullable positions and
 * passes through unknown keys.
 */
export const CachedFullSubjectSchema = z.object({
	subjectType: z.enum(["customer", "entity"]),
	customerId: z.string(),
	internalCustomerId: z.string(),
	entityId: z.string().optional(),
	internalEntityId: z.string().optional(),

	customer: CustomerSchema,
	entity: EntitySchema.optional(),

	customer_products: z.array(CusProductSchema),
	customer_prices: z.array(CustomerPriceSchema),
	flags: z.record(z.string(), SubjectFlagSchema),

	products: z.array(ProductSchema),
	entitlements: z.array(EntitlementWithFeatureSchema),
	prices: z.array(PriceSchema),
	free_trials: z.array(FreeTrialSchema),

	subscriptions: z.array(SubscriptionSchema),
	invoices: z.array(InvoiceSchema),

	entity_aggregations: EntityAggregationsSchema.optional(),

	// `.default([])` makes pre-existing cache entries (written before this
	// field existed) hole-fill to an empty array via `normalizeFromSchema`.
	// The empty-array vs empty-object Lua quirk is also handled there.
	migration_item_runs: z.array(MigrationItemRunSchema).default([]),

	_schemaVersion: z.number().optional(),
	_cachedAt: z.number(),
	meteredFeatures: z.array(z.string()),
	customerEntitlementIdsByFeatureId: z.record(z.string(), z.array(z.string())),
	// Optional (not defaulted): pre-usage-windows cache entries don't carry it,
	// and the hole-filling walker must not invent it.
	usageWindowFeatureIds: z.array(z.string()).optional(),
	subjectViewEpoch: z.number(),
});

export const normalizedToCachedFullSubject = ({
	normalized,
	subjectViewEpoch,
}: {
	normalized: NormalizedFullSubject;
	subjectViewEpoch: number;
}): CachedFullSubject => {
	const customerEntitlementIdsByFeatureId: Record<string, string[]> = {};

	for (const customerEntitlement of normalized.customer_entitlements) {
		const existingMembership =
			customerEntitlementIdsByFeatureId[customerEntitlement.feature_id] ?? [];
		existingMembership.push(customerEntitlement.id);
		customerEntitlementIdsByFeatureId[customerEntitlement.feature_id] =
			existingMembership;
	}

	const meteredFeatureSet = new Set(
		Object.keys(customerEntitlementIdsByFeatureId),
	);

	for (const aggregatedCustomerEntitlement of normalized.entity_aggregations
		?.aggregated_customer_entitlements ?? []) {
		if (aggregatedCustomerEntitlement.feature_id) {
			meteredFeatureSet.add(aggregatedCustomerEntitlement.feature_id);
		}
	}

	const meteredFeatures = [...meteredFeatureSet];

	const usageWindowFeatureIds = [
		...new Set(
			[
				...(normalized.customer.usage_limits ?? []),
				...(normalized.entity?.usage_limits ?? []),
			].map((usageLimit) => usageLimit.feature_id),
		),
	];

	return {
		subjectType: normalized.subjectType,
		customerId: normalized.customerId,
		internalCustomerId: normalized.internalCustomerId,
		entityId: normalized.entityId,
		internalEntityId: normalized.internalEntityId,
		customer: normalized.customer,
		entity: normalized.entity,
		customer_products: normalized.customer_products,
		customer_prices: normalized.customer_prices,
		flags: normalized.flags,
		products: normalized.products,
		entitlements: normalized.entitlements,
		prices: normalized.prices,
		free_trials: normalized.free_trials,
		subscriptions: normalized.subscriptions,
		invoices: normalized.invoices,
		entity_aggregations: normalized.entity_aggregations,
		migration_item_runs: normalized.migration_item_runs ?? [],
		_schemaVersion: FULL_SUBJECT_CACHE_SCHEMA_VERSION,
		_cachedAt: Date.now(),
		meteredFeatures,
		customerEntitlementIdsByFeatureId,
		usageWindowFeatureIds,
		subjectViewEpoch,
	};
};

export const cachedFullSubjectToNormalized = ({
	cached,
	customerEntitlements,
}: {
	cached: CachedFullSubject;
	customerEntitlements: NormalizedFullSubject["customer_entitlements"];
}): NormalizedFullSubject => {
	return {
		subjectType: cached.subjectType,
		customerId: cached.customerId,
		internalCustomerId: cached.internalCustomerId,
		entityId: cached.entityId,
		internalEntityId: cached.internalEntityId,
		customer: cached.customer,
		entity: cached.entity,
		customer_products: cached.customer_products,
		customer_entitlements: customerEntitlements,
		customer_prices: cached.customer_prices,
		flags: cached.flags,
		products: cached.products,
		entitlements: cached.entitlements,
		prices: cached.prices,
		free_trials: cached.free_trials,
		subscriptions: cached.subscriptions,
		invoices: cached.invoices,
		entity_aggregations: cached.entity_aggregations,
		migration_item_runs: cached.migration_item_runs ?? [],
		// Live data: filled from the balance hashes' `_usage_windows` fields by
		// the caller, never from the cached subject view.
		usage_windows: [],
	};
};
