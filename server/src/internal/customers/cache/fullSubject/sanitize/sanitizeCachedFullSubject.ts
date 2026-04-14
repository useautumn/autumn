import type { CachedFullSubject } from "../fullSubjectCacheModel.js";
import { type ShapeSpec, sanitizeShape } from "./sanitizeCacheShapeUtils.js";

const featureShapeSpec: ShapeSpec = {
	event_names: "array",
};

const entitlementCatalogShapeSpec: ShapeSpec = {
	feature: featureShapeSpec,
};

const priceConfigShapeSpec: ShapeSpec = {
	usage_tiers: "array",
};

const priceShapeSpec: ShapeSpec = {
	config: priceConfigShapeSpec,
};

const customerShapeSpec: ShapeSpec = {
	auto_topups: "array",
	spend_limits: "array",
	usage_alerts: "array",
	overage_allowed: "array",
};

const entityShapeSpec: ShapeSpec = {
	spend_limits: "array",
	usage_alerts: "array",
	overage_allowed: "array",
};

const customerProductShapeSpec: ShapeSpec = {
	options: "array",
	subscription_ids: "array",
	scheduled_ids: "array",
};

const subscriptionShapeSpec: ShapeSpec = {
	usage_features: "array",
};

const invoiceShapeSpec: ShapeSpec = {
	product_ids: "array",
	internal_product_ids: "array",
	discounts: "array",
	items: "array",
};

const entityAggregationsShapeSpec: ShapeSpec = {
	aggregated_customer_products: { items: customerProductShapeSpec },
	aggregated_customer_entitlements: "array",
};

const cachedFullSubjectShapeSpec: ShapeSpec = {
	customer: customerShapeSpec,
	entity: entityShapeSpec,
	customer_products: { items: customerProductShapeSpec },
	products: "array",
	entitlements: { items: entitlementCatalogShapeSpec },
	prices: { items: priceShapeSpec },
	free_trials: "array",
	subscriptions: { items: subscriptionShapeSpec },
	invoices: { items: invoiceShapeSpec },
	flags: "record",
	meteredFeatures: "array",
	customerEntitlementIdsByFeatureId: "record",
	entity_aggregations: entityAggregationsShapeSpec,
};

export const sanitizeCachedFullSubject = ({
	cachedFullSubject,
}: {
	cachedFullSubject: CachedFullSubject;
}): CachedFullSubject =>
	sanitizeShape<CachedFullSubject>({
		value: cachedFullSubject,
		spec: cachedFullSubjectShapeSpec,
	});
