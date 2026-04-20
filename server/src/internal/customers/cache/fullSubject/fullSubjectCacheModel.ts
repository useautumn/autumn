import {
	CusProductSchema,
	CustomerSchema,
	EntitlementWithFeatureSchema,
	EntityAggregationsSchema,
	EntitySchema,
	FreeTrialSchema,
	InvoiceSchema,
	type NormalizedFullSubject,
	PriceSchema,
	ProductSchema,
	SubjectFlagSchema,
	SubscriptionSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

export type CachedFullSubject = Omit<
	NormalizedFullSubject,
	"customer_entitlements" | "customer_prices"
> & {
	_cachedAt: number;
	meteredFeatures: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	subjectViewEpoch: number;
};

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
	flags: z.record(z.string(), SubjectFlagSchema),

	products: z.array(ProductSchema),
	entitlements: z.array(EntitlementWithFeatureSchema),
	prices: z.array(PriceSchema),
	free_trials: z.array(FreeTrialSchema),

	subscriptions: z.array(SubscriptionSchema),
	invoices: z.array(InvoiceSchema),

	entity_aggregations: EntityAggregationsSchema.optional(),

	_cachedAt: z.number(),
	meteredFeatures: z.array(z.string()),
	customerEntitlementIdsByFeatureId: z.record(z.string(), z.array(z.string())),
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

	return {
		subjectType: normalized.subjectType,
		customerId: normalized.customerId,
		internalCustomerId: normalized.internalCustomerId,
		entityId: normalized.entityId,
		internalEntityId: normalized.internalEntityId,
		customer: normalized.customer,
		entity: normalized.entity,
		customer_products: normalized.customer_products,
		flags: normalized.flags,
		products: normalized.products,
		entitlements: normalized.entitlements,
		prices: normalized.prices,
		free_trials: normalized.free_trials,
		subscriptions: normalized.subscriptions,
		invoices: normalized.invoices,
		entity_aggregations: normalized.entity_aggregations,
		_cachedAt: Date.now(),
		meteredFeatures,
		customerEntitlementIdsByFeatureId,
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
		customer_prices: [],
		flags: cached.flags,
		products: cached.products,
		entitlements: cached.entitlements,
		prices: cached.prices,
		free_trials: cached.free_trials,
		subscriptions: cached.subscriptions,
		invoices: cached.invoices,
		entity_aggregations: cached.entity_aggregations,
	};
};
