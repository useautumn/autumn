import type { NormalizedFullSubject } from "@autumn/shared";

export type CachedFullSubject = Omit<
	NormalizedFullSubject,
	"customer_entitlements" | "customer_prices"
> & {
	_cachedAt: number;
	meteredFeatures: string[];
	customerEntityEpoch?: number;
};

export const normalizedToCachedFullSubject = ({
	normalized,
	customerEntityEpoch,
}: {
	normalized: NormalizedFullSubject;
	customerEntityEpoch?: number;
}): CachedFullSubject => {
	const meteredFeatures = Array.from(
		new Set(
			normalized.customer_entitlements.map((balance) => balance.feature_id),
		),
	);

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
		customerEntityEpoch,
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
