import type { NormalizedFullSubject, Subscription } from "@autumn/shared";
import {
	type CachedFullSubject,
	FULL_SUBJECT_CACHE_SCHEMA_VERSION,
	normalizedToCachedFullSubject,
} from "../fullSubjectCacheModel.js";

export const RUNTIME_SUBJECT_SCHEMA_VERSION = 1;
export const RUNTIME_SUBJECT_CORE_FIELD = "_core";

export type CachedRuntimeSubjectCore = Pick<
	CachedFullSubject,
	| "subjectType"
	| "customerId"
	| "internalCustomerId"
	| "entityId"
	| "internalEntityId"
	| "customer"
	| "entity"
	| "_cachedAt"
	| "subjectViewEpoch"
> & {
	_schemaVersion: number;
	knownFeatureIds: string[];
};

export type CachedRuntimeSubjectFeature = Pick<
	CachedFullSubject,
	| "customer_products"
	| "customer_prices"
	| "customer_licenses"
	| "flags"
	| "products"
	| "entitlements"
	| "prices"
	| "free_trials"
> & {
	featureId: string;
	customerEntitlementIds: string[];
	usageWindowEnabled: boolean;
	subscriptions: Subscription[];
	entity_aggregations?: CachedFullSubject["entity_aggregations"];
};

export type CachedRuntimeSubjectProjection = {
	core: CachedRuntimeSubjectCore;
	features: Record<string, CachedRuntimeSubjectFeature>;
};

const BILLING_CONTROL_KEYS = [
	"auto_topups",
	"spend_limits",
	"usage_limits",
	"usage_alerts",
	"overage_allowed",
] as const;

const productReferencesFeature = ({
	product,
	featureId,
}: {
	product: NormalizedFullSubject["products"][number];
	featureId: string;
}): boolean =>
	BILLING_CONTROL_KEYS.some((controlKey) =>
		(product[controlKey] ?? []).some(
			(control) => control.feature_id === featureId,
		),
	);

const uniqueBy = <T>({
	values,
	key,
}: {
	values: T[];
	key: (value: T) => string;
}): T[] => {
	const seen = new Set<string>();
	return values.filter((value) => {
		const valueKey = key(value);
		if (seen.has(valueKey)) return false;
		seen.add(valueKey);
		return true;
	});
};

const buildRuntimeFeature = ({
	normalized,
	cached,
	featureId,
}: {
	normalized: NormalizedFullSubject;
	cached: CachedFullSubject;
	featureId: string;
}): CachedRuntimeSubjectFeature => {
	const relevantBalances = normalized.customer_entitlements.filter(
		(balance) => balance.feature_id === featureId,
	);
	const relevantFlag = normalized.flags[featureId];
	const referencedCustomerProductIds = new Set(
		[
			...relevantBalances.map((balance) => balance.customer_product_id),
			relevantFlag?.customerProductId,
		].filter((id): id is string => Boolean(id)),
	);
	const productByInternalId = new Map(
		normalized.products.map((product) => [product.internal_id, product]),
	);
	const productIdsForFeature = new Set(
		normalized.entitlements
			.filter((entitlement) => entitlement.feature.id === featureId)
			.map((entitlement) => entitlement.internal_product_id),
	);
	const licenseParentIdsForFeature = new Set(
		(normalized.customer_licenses ?? [])
			.filter((customerLicense) =>
				customerLicense.planLicense?.product.entitlements.some(
					(entitlement) => entitlement.feature.id === featureId,
				),
			)
			.map((customerLicense) => customerLicense.parent_customer_product_id),
	);

	for (const customerProduct of normalized.customer_products) {
		const product = productByInternalId.get(
			customerProduct.internal_product_id,
		);
		if (
			(product &&
				(productIdsForFeature.has(product.internal_id) ||
					productReferencesFeature({ product, featureId }))) ||
			licenseParentIdsForFeature.has(customerProduct.id)
		) {
			referencedCustomerProductIds.add(customerProduct.id);
		}
	}

	const customerProducts = normalized.customer_products.filter(
		(customerProduct) => referencedCustomerProductIds.has(customerProduct.id),
	);
	const referencedProductIds = new Set(
		customerProducts.map(
			(customerProduct) => customerProduct.internal_product_id,
		),
	);
	const aggregatedCustomerProducts =
		normalized.entity_aggregations?.aggregated_customer_products.filter(
			(customerProduct) => {
				const product = productByInternalId.get(
					customerProduct.internal_product_id,
				);
				const relevant = Boolean(
					product &&
						(productIdsForFeature.has(product.internal_id) ||
							productReferencesFeature({ product, featureId })),
				);
				if (relevant) {
					referencedProductIds.add(customerProduct.internal_product_id);
				}
				return relevant;
			},
		) ?? [];
	const customerPrices = normalized.customer_prices.filter((customerPrice) =>
		customerPrice.customer_product_id
			? referencedCustomerProductIds.has(customerPrice.customer_product_id)
			: false,
	);
	const referencedPriceIds = new Set(
		customerPrices
			.map((customerPrice) => customerPrice.price_id)
			.filter((id): id is string => Boolean(id)),
	);
	const referencedFreeTrialIds = new Set(
		customerProducts
			.map((customerProduct) => customerProduct.free_trial_id)
			.filter((id): id is string => Boolean(id)),
	);
	const referencedSubscriptionIds = new Set(
		customerProducts.flatMap(
			(customerProduct) => customerProduct.subscription_ids ?? [],
		),
	);
	const aggregatedCustomerEntitlements =
		normalized.entity_aggregations?.aggregated_customer_entitlements.filter(
			(balance) => balance.feature_id === featureId,
		) ?? [];
	const aggregatedSubjectFlag =
		normalized.entity_aggregations?.aggregated_subject_flags[featureId];

	return {
		featureId,
		customerEntitlementIds: relevantBalances.map((balance) => balance.id),
		usageWindowEnabled: (cached.usageWindowFeatureIds ?? []).includes(
			featureId,
		),
		customer_products: customerProducts,
		customer_prices: customerPrices,
		customer_licenses: (normalized.customer_licenses ?? []).filter(
			(customerLicense) =>
				referencedCustomerProductIds.has(
					customerLicense.parent_customer_product_id,
				),
		),
		flags: relevantFlag ? { [featureId]: relevantFlag } : {},
		products: normalized.products.filter((product) =>
			referencedProductIds.has(product.internal_id),
		),
		entitlements: normalized.entitlements.filter(
			(entitlement) => entitlement.feature.id === featureId,
		),
		prices: normalized.prices.filter((price) =>
			referencedPriceIds.has(price.id),
		),
		free_trials: normalized.free_trials.filter((freeTrial) =>
			referencedFreeTrialIds.has(freeTrial.id),
		),
		subscriptions: normalized.subscriptions.filter((subscription) =>
			referencedSubscriptionIds.has(subscription.id),
		),
		...(normalized.entity_aggregations
			? {
					entity_aggregations: {
						aggregated_customer_products: aggregatedCustomerProducts,
						aggregated_customer_entitlements: aggregatedCustomerEntitlements,
						aggregated_subject_flags: aggregatedSubjectFlag
							? { [featureId]: aggregatedSubjectFlag }
							: {},
					},
				}
			: {}),
	};
};

export const buildRuntimeSubjectProjection = ({
	normalized,
	subjectViewEpoch,
	knownFeatureIds,
	projectedFeatureIds,
}: {
	normalized: NormalizedFullSubject;
	subjectViewEpoch: number;
	knownFeatureIds: string[];
	projectedFeatureIds?: string[];
}): CachedRuntimeSubjectProjection => {
	const cached = normalizedToCachedFullSubject({
		normalized,
		subjectViewEpoch,
	});
	const allSubjectFeatureIds = [
		...new Set([
			...knownFeatureIds,
			...cached.meteredFeatures,
			...Object.keys(cached.flags),
			...(cached.usageWindowFeatureIds ?? []),
		]),
	];
	const featureIdsToProject = projectedFeatureIds ?? allSubjectFeatureIds;
	const features: Record<string, CachedRuntimeSubjectFeature> = {};

	for (const featureId of featureIdsToProject) {
		features[featureId] = buildRuntimeFeature({
			normalized,
			cached,
			featureId,
		});
	}

	return {
		core: {
			subjectType: cached.subjectType,
			customerId: cached.customerId,
			internalCustomerId: cached.internalCustomerId,
			entityId: cached.entityId,
			internalEntityId: cached.internalEntityId,
			customer: cached.customer,
			entity: cached.entity,
			_cachedAt: cached._cachedAt,
			subjectViewEpoch: cached.subjectViewEpoch,
			_schemaVersion: RUNTIME_SUBJECT_SCHEMA_VERSION,
			knownFeatureIds: [...new Set(knownFeatureIds)],
		},
		features,
	};
};

export const runtimeSubjectProjectionToHashFields = ({
	projection,
}: {
	projection: CachedRuntimeSubjectProjection;
}): Record<string, string> => ({
	[RUNTIME_SUBJECT_CORE_FIELD]: JSON.stringify(projection.core),
	...Object.fromEntries(
		Object.entries(projection.features).map(([featureId, feature]) => [
			featureId,
			JSON.stringify(feature),
		]),
	),
});

export const mergeRuntimeSubjectProjection = ({
	core,
	features,
}: {
	core: CachedRuntimeSubjectCore;
	features: Array<CachedRuntimeSubjectFeature | undefined>;
}): CachedFullSubject => {
	const presentFeatures = features.filter(
		(feature): feature is CachedRuntimeSubjectFeature => Boolean(feature),
	);
	const entityAggregations = presentFeatures
		.map((feature) => feature.entity_aggregations)
		.filter(
			(
				aggregations,
			): aggregations is NonNullable<
				CachedRuntimeSubjectFeature["entity_aggregations"]
			> => Boolean(aggregations),
		);

	return {
		subjectType: core.subjectType,
		customerId: core.customerId,
		internalCustomerId: core.internalCustomerId,
		entityId: core.entityId,
		internalEntityId: core.internalEntityId,
		customer: core.customer,
		entity: core.entity,
		customer_products: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.customer_products),
			key: (customerProduct) => customerProduct.id,
		}),
		customer_prices: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.customer_prices),
			key: (customerPrice) => customerPrice.id,
		}),
		customer_licenses: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.customer_licenses),
			key: (customerLicense) => customerLicense.id,
		}),
		flags: Object.assign(
			{},
			...presentFeatures.map((feature) => feature.flags),
		),
		products: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.products),
			key: (product) => product.internal_id,
		}),
		entitlements: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.entitlements),
			key: (entitlement) => entitlement.id,
		}),
		prices: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.prices),
			key: (price) => price.id,
		}),
		free_trials: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.free_trials),
			key: (freeTrial) => freeTrial.id,
		}),
		subscriptions: uniqueBy({
			values: presentFeatures.flatMap((feature) => feature.subscriptions),
			key: (subscription) => subscription.id,
		}),
		invoices: [],
		migration_item_runs: [],
		...(entityAggregations.length > 0
			? {
					entity_aggregations: {
						aggregated_customer_products: uniqueBy({
							values: entityAggregations.flatMap(
								(aggregations) => aggregations.aggregated_customer_products,
							),
							key: (customerProduct) => customerProduct.id,
						}),
						aggregated_customer_entitlements: entityAggregations.flatMap(
							(aggregations) => aggregations.aggregated_customer_entitlements,
						),
						aggregated_subject_flags: Object.assign(
							{},
							...entityAggregations.map(
								(aggregations) => aggregations.aggregated_subject_flags,
							),
						),
					},
				}
			: {}),
		_schemaVersion: FULL_SUBJECT_CACHE_SCHEMA_VERSION,
		_cachedAt: core._cachedAt,
		meteredFeatures: presentFeatures
			.filter(
				(feature) =>
					feature.customerEntitlementIds.length > 0 ||
					(feature.entity_aggregations?.aggregated_customer_entitlements
						.length ?? 0) > 0,
			)
			.map((feature) => feature.featureId),
		customerEntitlementIdsByFeatureId: Object.fromEntries(
			presentFeatures.map((feature) => [
				feature.featureId,
				feature.customerEntitlementIds,
			]),
		),
		usageWindowFeatureIds: presentFeatures
			.filter((feature) => feature.usageWindowEnabled)
			.map((feature) => feature.featureId),
		subjectViewEpoch: core.subjectViewEpoch,
	};
};
