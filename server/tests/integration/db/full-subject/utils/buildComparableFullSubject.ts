import type {
	FullAggregatedFeatureBalance,
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
	FullCustomerPrice,
	FullSubject,
	Invoice,
	Subscription,
} from "@autumn/shared";
import { FeatureType } from "@autumn/shared";

const sortByString = <T>(items: T[], getValue: (item: T) => string) =>
	[...items].sort((left, right) =>
		getValue(left).localeCompare(getValue(right)),
	);

const comparableRollover = (
	rollover: FullCustomerEntitlement["rollovers"][number],
) => ({
	id: rollover.id,
	cus_ent_id: rollover.cus_ent_id,
	balance: rollover.balance,
	usage: rollover.usage,
	expires_at: rollover.expires_at,
	entities: rollover.entities,
});

const comparableCustomerEntitlement = (
	customerEntitlement: FullCustomerEntitlement,
) => {
	const base = {
		id: customerEntitlement.id,
		customer_product_id: customerEntitlement.customer_product_id,
		entitlement_id: customerEntitlement.entitlement_id,
		internal_entity_id: customerEntitlement.internal_entity_id,
		internal_feature_id: customerEntitlement.internal_feature_id,
		feature_id: customerEntitlement.feature_id,
		external_id: customerEntitlement.external_id,
		expires_at: customerEntitlement.expires_at,
		entitlement: {
			id: customerEntitlement.entitlement.id,
			internal_feature_id: customerEntitlement.entitlement.internal_feature_id,
			entity_feature_id: customerEntitlement.entitlement.entity_feature_id,
			allowance_type: customerEntitlement.entitlement.allowance_type,
			allowance: customerEntitlement.entitlement.allowance,
			interval: customerEntitlement.entitlement.interval,
			interval_count: customerEntitlement.entitlement.interval_count,
			usage_limit: customerEntitlement.entitlement.usage_limit,
			feature: {
				id: customerEntitlement.entitlement.feature.id,
				internal_id: customerEntitlement.entitlement.feature.internal_id,
				type: customerEntitlement.entitlement.feature.type,
			},
		},
		rollovers: sortByString(
			customerEntitlement.rollovers.map(comparableRollover),
			(rollover) => rollover.id,
		),
	};

	if (customerEntitlement.entitlement.feature.type === FeatureType.Boolean) {
		return base;
	}

	return {
		...base,
		unlimited: customerEntitlement.unlimited,
		balance: customerEntitlement.balance,
		adjustment: customerEntitlement.adjustment,
		additional_balance: customerEntitlement.additional_balance,
		usage_allowed: customerEntitlement.usage_allowed,
		next_reset_at: customerEntitlement.next_reset_at,
		entities: customerEntitlement.entities,
	};
};

const comparableCustomerPrice = (customerPrice: FullCustomerPrice) => ({
	id: customerPrice.id,
	customer_product_id: customerPrice.customer_product_id,
	price_id: customerPrice.price_id,
	price: {
		id: customerPrice.price.id,
		internal_product_id: customerPrice.price.internal_product_id,
		entitlement_id: customerPrice.price.entitlement_id,
		billing_type: customerPrice.price.billing_type,
		config: customerPrice.price.config,
	},
});

const comparableCustomerProduct = (customerProduct: FullCusProduct) => ({
	id: customerProduct.id,
	product_id: customerProduct.product_id,
	internal_product_id: customerProduct.internal_product_id,
	internal_entity_id: customerProduct.internal_entity_id,
	status: customerProduct.status,
	quantity: customerProduct.quantity,
	options: customerProduct.options,
	subscription_ids: customerProduct.subscription_ids,
	free_trial_id: customerProduct.free_trial_id,
	product: {
		id: customerProduct.product.id,
		internal_id: customerProduct.product.internal_id,
		is_add_on: customerProduct.product.is_add_on,
		is_default: customerProduct.product.is_default,
		group: customerProduct.product.group,
		version: customerProduct.product.version,
		archived: customerProduct.product.archived,
	},
	customer_prices: sortByString(
		customerProduct.customer_prices.map(comparableCustomerPrice),
		(customerPrice) => customerPrice.id,
	),
	customer_entitlements: sortByString(
		customerProduct.customer_entitlements.map(comparableCustomerEntitlement),
		(customerEntitlement) => customerEntitlement.id,
	),
});

const comparableSubscription = (subscription: Subscription) => ({
	id: subscription.id,
	stripe_id: subscription.stripe_id,
	current_period_start: subscription.current_period_start,
	current_period_end: subscription.current_period_end,
	usage_features: [...subscription.usage_features].sort(),
});

const comparableInvoice = (invoice: Invoice) => ({
	id: invoice.id,
	internal_entity_id: invoice.internal_entity_id,
	stripe_id: invoice.stripe_id,
	status: invoice.status,
	total: invoice.total,
	currency: invoice.currency,
	product_ids: [...invoice.product_ids].sort(),
	internal_product_ids: [...invoice.internal_product_ids].sort(),
});

const comparableAggregatedEntitlement = (
	customerEntitlement: FullAggregatedFeatureBalance,
) => ({
	api_id: customerEntitlement.api_id,
	internal_feature_id: customerEntitlement.internal_feature_id,
	feature_id: customerEntitlement.feature_id,
	allowance_total: customerEntitlement.allowance_total,
	balance: customerEntitlement.balance,
	adjustment: customerEntitlement.adjustment,
	additional_balance: customerEntitlement.additional_balance,
	unlimited: customerEntitlement.unlimited,
	usage_allowed: customerEntitlement.usage_allowed,
	entities: customerEntitlement.entities,
	feature: {
		id: customerEntitlement.feature.id,
		type: customerEntitlement.feature.type,
	},
});

export const fullCustomerToComparableSubject = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}) => ({
	customer_products: sortByString(
		fullCustomer.customer_products.map(comparableCustomerProduct),
		(customerProduct) => customerProduct.id,
	),
	extra_customer_entitlements: sortByString(
		(fullCustomer.extra_customer_entitlements ?? []).map(
			comparableCustomerEntitlement,
		),
		(customerEntitlement) => customerEntitlement.id,
	),
	subscriptions: sortByString(
		(fullCustomer.subscriptions ?? []).map(comparableSubscription),
		(subscription) => subscription.id,
	),
	invoices: sortByString(
		(fullCustomer.invoices ?? []).map(comparableInvoice),
		(invoice) => invoice.id,
	),
});

export const fullSubjectToComparableSubject = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}) => ({
	customer_products: sortByString(
		fullSubject.customer_products.map(comparableCustomerProduct),
		(customerProduct) => customerProduct.id,
	),
	extra_customer_entitlements: sortByString(
		(fullSubject.extra_customer_entitlements ?? []).map(
			comparableCustomerEntitlement,
		),
		(customerEntitlement) => customerEntitlement.id,
	),
	subscriptions: sortByString(
		(fullSubject.subscriptions ?? []).map(comparableSubscription),
		(subscription) => subscription.id,
	),
	invoices: sortByString(
		(fullSubject.invoices ?? []).map(comparableInvoice),
		(invoice) => invoice.id,
	),
	aggregated_customer_products: sortByString(
		(fullSubject.aggregated_customer_products ?? []).map(
			comparableCustomerProduct,
		),
		(customerProduct) => customerProduct.id,
	),
	aggregated_customer_entitlements: sortByString(
		(fullSubject.aggregated_customer_entitlements ?? []).map(
			comparableAggregatedEntitlement,
		),
		(customerEntitlement) =>
			`${customerEntitlement.internal_feature_id}:${customerEntitlement.feature_id}`,
	),
});
