import {
	ApiVersion,
	BillingInterval,
	BillingType,
	BillingVersion,
	CollectionMethod,
	CusProductStatus,
	type DbCustomer,
	type DbCustomerEntitlement,
	type DbCustomerPrice,
	type DbCustomerProduct,
	type DbEntitlement,
	type DbFeature,
	type DbPrice,
	type DbProduct,
	type DbRollover,
	EntInterval,
	type Entity,
	FeatureType,
	type InvoiceRow,
	InvoiceStatus,
	type SubscriptionRow,
} from "@autumn/shared";
import { AllowanceType } from "@shared/models/productModels/entModels/entModels.js";
import { BillWhen } from "@shared/models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";

type ScenarioIds = {
	customerId: string;
	internalCustomerId: string;
	entityIds: string[];
	internalEntityIds: string[];
	productInternalIds: string[];
	productIds: string[];
	subscriptionIds: string[];
};

export type FullSubjectScenario = {
	customer: DbCustomer;
	entities: Entity[];
	products: DbProduct[];
	entitlements: DbEntitlement[];
	prices: DbPrice[];
	customerProducts: DbCustomerProduct[];
	customerPrices: DbCustomerPrice[];
	customerEntitlements: DbCustomerEntitlement[];
	rollovers: DbRollover[];
	subscriptions: SubscriptionRow[];
	invoices: InvoiceRow[];
	ids: ScenarioIds;
};

const now = Date.now();

const buildUniqueKey = ({ name }: { name: string }) =>
	`${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const requireFeature = ({
	ctx,
	featureId,
}: {
	ctx: TestContext;
	featureId: TestFeature;
}): DbFeature => {
	const feature = ctx.features.find((candidate) => candidate.id === featureId);
	if (!feature) throw new Error(`Feature ${featureId} not found in test org`);
	return feature as DbFeature;
};

const buildCustomer = ({
	ctx,
	key,
}: {
	ctx: TestContext;
	key: string;
}): DbCustomer => ({
	internal_id: `cus_int_${key}`,
	org_id: ctx.org.id,
	created_at: now,
	name: `Customer ${key}`,
	id: `cus_${key}`,
	email: `${key}@example.com`,
	fingerprint: null,
	metadata: {},
	env: ctx.env,
	processor: null,
	processors: {},
	send_email_receipts: false,
	auto_topups: null,
	spend_limits: null,
	usage_alerts: null,
	overage_allowed: null,
});

const buildEntity = ({
	ctx,
	customer,
	key,
	index,
}: {
	ctx: TestContext;
	customer: DbCustomer;
	key: string;
	index: number;
}): Entity => {
	const usersFeature = requireFeature({ ctx, featureId: TestFeature.Users });
	return {
		id: `ent_${key}_${index}`,
		org_id: ctx.org.id,
		created_at: now,
		internal_id: `ent_int_${key}_${index}`,
		internal_customer_id: customer.internal_id,
		env: ctx.env,
		name: `Entity ${index}`,
		deleted: false,
		internal_feature_id: usersFeature.internal_id,
		spend_limits: null,
		usage_alerts: null,
		overage_allowed: null,
		feature_id: usersFeature.id,
	};
};

const buildProduct = ({
	ctx,
	key,
	suffix,
}: {
	ctx: TestContext;
	key: string;
	suffix: string;
}): DbProduct => ({
	internal_id: `prod_int_${key}_${suffix}`,
	id: `prod_${key}_${suffix}`,
	name: `Product ${suffix}`,
	description: `Product ${suffix}`,
	org_id: ctx.org.id,
	created_at: now,
	env: ctx.env,
	is_add_on: false,
	is_default: false,
	group: "db-fullsubject",
	version: 1,
	processor: null,
	base_variant_id: null,
	archived: false,
});

const buildEntitlement = ({
	ctx,
	product,
	feature,
	key,
	suffix,
	entityFeatureId = null,
}: {
	ctx: TestContext;
	product: DbProduct;
	feature: DbFeature;
	key: string;
	suffix: string;
	entityFeatureId?: string | null;
}): DbEntitlement => ({
	id: `ent_${key}_${suffix}`,
	created_at: now,
	internal_feature_id: feature.internal_id,
	internal_product_id: product.internal_id,
	is_custom: false,
	allowance_type:
		feature.type === FeatureType.Boolean
			? AllowanceType.None
			: AllowanceType.Fixed,
	allowance: feature.type === FeatureType.Boolean ? null : 100,
	interval: feature.type === FeatureType.Boolean ? null : EntInterval.Month,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: entityFeatureId,
	org_id: ctx.org.id,
	feature_id: feature.id,
	usage_limit: null,
	rollover: null,
});

const buildPrice = ({
	ctx,
	product,
	entitlement,
	key,
	suffix,
}: {
	ctx: TestContext;
	product: DbProduct;
	entitlement: DbEntitlement;
	key: string;
	suffix: string;
}): DbPrice => ({
	id: `price_${key}_${suffix}`,
	org_id: ctx.org.id,
	internal_product_id: product.internal_id,
	config: {
		type: "usage",
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: entitlement.internal_feature_id,
		feature_id: entitlement.feature_id ?? "",
		usage_tiers: [{ to: 1000, amount: 1 }],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_meter_id: null,
		stripe_price_id: null,
		stripe_empty_price_id: null,
		stripe_product_id: null,
		stripe_placeholder_price_id: null,
		stripe_event_name: null,
		stripe_prepaid_price_v2_id: null,
		should_prorate: false,
	},
	created_at: now,
	billing_type: BillingType.UsageInArrear,
	tier_behavior: null,
	is_custom: false,
	entitlement_id: entitlement.id,
	proration_config: null,
});

const buildCustomerProduct = ({
	customer,
	product,
	key,
	suffix,
	internalEntityId = null,
	entityId = null,
	subscriptionStripeIds = [],
}: {
	customer: DbCustomer;
	product: DbProduct;
	key: string;
	suffix: string;
	internalEntityId?: string | null;
	entityId?: string | null;
	subscriptionStripeIds?: string[];
}): DbCustomerProduct => ({
	id: `cp_${key}_${suffix}`,
	internal_customer_id: customer.internal_id,
	internal_product_id: product.internal_id,
	internal_entity_id: internalEntityId,
	created_at: now,
	status: CusProductStatus.Active,
	processor: null,
	canceled: false,
	canceled_at: null,
	ended_at: null,
	starts_at: now,
	options: [],
	product_id: product.id,
	free_trial_id: null,
	trial_ends_at: null,
	collection_method: CollectionMethod.ChargeAutomatically,
	subscription_ids: subscriptionStripeIds,
	scheduled_ids: null,
	quantity: 1,
	is_custom: false,
	customer_id: customer.id ?? null,
	entity_id: entityId,
	billing_version: BillingVersion.V2,
	api_version: null,
	api_semver: ApiVersion.V2_2,
	external_id: null,
});

const buildCustomerPrice = ({
	customer,
	customerProduct,
	price,
	key,
	suffix,
}: {
	customer: DbCustomer;
	customerProduct: DbCustomerProduct;
	price: DbPrice;
	key: string;
	suffix: string;
}): DbCustomerPrice => ({
	id: `cpr_${key}_${suffix}`,
	created_at: now,
	price_id: price.id,
	options: null,
	internal_customer_id: customer.internal_id,
	customer_product_id: customerProduct.id,
});

const buildCustomerEntitlement = ({
	customer,
	entitlement,
	key,
	suffix,
	customerProductId = null,
	internalEntityId = null,
	balance = 100,
	expiresAt = null,
}: {
	customer: DbCustomer;
	entitlement: DbEntitlement;
	key: string;
	suffix: string;
	customerProductId?: string | null;
	internalEntityId?: string | null;
	balance?: number;
	expiresAt?: number | null;
}): DbCustomerEntitlement => ({
	id: `ce_${key}_${suffix}`,
	customer_product_id: customerProductId,
	entitlement_id: entitlement.id,
	internal_customer_id: customer.internal_id,
	internal_entity_id: internalEntityId,
	internal_feature_id: entitlement.internal_feature_id,
	unlimited: false,
	balance,
	created_at: now,
	next_reset_at: now + 30 * 24 * 60 * 60 * 1000,
	usage_allowed: false,
	adjustment: 0,
	additional_balance: 0,
	entities: null,
	expires_at: expiresAt,
	cache_version: 0,
	customer_id: customer.id ?? null,
	feature_id: entitlement.feature_id ?? null,
	external_id: `bal_${key}_${suffix}`,
});

const buildRollover = ({
	customerEntitlement,
	key,
	suffix,
	balance,
	expiresAt,
}: {
	customerEntitlement: DbCustomerEntitlement;
	key: string;
	suffix: string;
	balance: number;
	expiresAt: number;
}): DbRollover => ({
	id: `ro_${key}_${suffix}`,
	cus_ent_id: customerEntitlement.id,
	balance,
	expires_at: expiresAt,
	usage: 0,
	entities: {},
});

const buildSubscription = ({
	ctx,
	key,
	suffix,
}: {
	ctx: TestContext;
	key: string;
	suffix: string;
}): SubscriptionRow => ({
	id: `sub_${key}_${suffix}`,
	org_id: ctx.org.id,
	stripe_id: `stripe_sub_${key}_${suffix}`,
	stripe_schedule_id: null,
	created_at: now,
	metadata: {},
	usage_features: [TestFeature.Messages],
	env: ctx.env,
	current_period_start: now,
	current_period_end: now + 30 * 24 * 60 * 60 * 1000,
});

const buildInvoice = ({
	customer,
	key,
	suffix,
	product,
	internalEntityId = null,
}: {
	customer: DbCustomer;
	key: string;
	suffix: string;
	product: DbProduct;
	internalEntityId?: string | null;
}): InvoiceRow => ({
	id: `inv_${key}_${suffix}`,
	created_at: now,
	product_ids: [product.id],
	internal_product_ids: [product.internal_id],
	internal_customer_id: customer.internal_id,
	internal_entity_id: internalEntityId,
	stripe_id: `stripe_inv_${key}_${suffix}`,
	status: InvoiceStatus.Paid,
	hosted_invoice_url: null,
	total: 1000,
	currency: "usd",
	discounts: [],
	items: [],
});

const buildBaseCustomerScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}) => {
	const key = buildUniqueKey({ name });
	const customer = buildCustomer({ ctx, key });
	const parentProduct = buildProduct({ ctx, key, suffix: "parent" });
	const messagesFeature = requireFeature({
		ctx,
		featureId: TestFeature.Messages,
	});
	const dashboardFeature = requireFeature({
		ctx,
		featureId: TestFeature.Dashboard,
	});

	return {
		key,
		customer,
		parentProduct,
		messagesFeature,
		dashboardFeature,
	};
};

export const buildCustomerMeteredScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, parentProduct, messagesFeature } =
		buildBaseCustomerScenario({ ctx, name });
	const messagesEntitlement = buildEntitlement({
		ctx,
		product: parentProduct,
		feature: messagesFeature,
		key,
		suffix: "messages",
	});
	const messagesPrice = buildPrice({
		ctx,
		product: parentProduct,
		entitlement: messagesEntitlement,
		key,
		suffix: "messages",
	});
	const customerProduct = buildCustomerProduct({
		customer,
		product: parentProduct,
		key,
		suffix: "parent",
	});
	const customerPrice = buildCustomerPrice({
		customer,
		customerProduct,
		price: messagesPrice,
		key,
		suffix: "messages",
	});
	const customerEntitlement = buildCustomerEntitlement({
		customer,
		entitlement: messagesEntitlement,
		key,
		suffix: "messages",
		customerProductId: customerProduct.id,
		balance: 87,
	});

	return {
		customer,
		entities: [],
		products: [parentProduct],
		entitlements: [messagesEntitlement],
		prices: [messagesPrice],
		customerProducts: [customerProduct],
		customerPrices: [customerPrice],
		customerEntitlements: [customerEntitlement],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [],
			internalEntityIds: [],
			productInternalIds: [parentProduct.internal_id],
			productIds: [parentProduct.id],
			subscriptionIds: [],
		},
	};
};

export const buildCustomerMixedBooleanMeteredScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, parentProduct, messagesFeature, dashboardFeature } =
		buildBaseCustomerScenario({ ctx, name });
	const messagesEntitlement = buildEntitlement({
		ctx,
		product: parentProduct,
		feature: messagesFeature,
		key,
		suffix: "messages",
	});
	const dashboardEntitlement = buildEntitlement({
		ctx,
		product: parentProduct,
		feature: dashboardFeature,
		key,
		suffix: "dashboard",
	});
	const messagesPrice = buildPrice({
		ctx,
		product: parentProduct,
		entitlement: messagesEntitlement,
		key,
		suffix: "messages",
	});
	const customerProduct = buildCustomerProduct({
		customer,
		product: parentProduct,
		key,
		suffix: "parent",
	});
	const customerPrice = buildCustomerPrice({
		customer,
		customerProduct,
		price: messagesPrice,
		key,
		suffix: "messages",
	});
	const meteredCe = buildCustomerEntitlement({
		customer,
		entitlement: messagesEntitlement,
		key,
		suffix: "messages",
		customerProductId: customerProduct.id,
		balance: 42,
	});
	const booleanCe = buildCustomerEntitlement({
		customer,
		entitlement: dashboardEntitlement,
		key,
		suffix: "dashboard",
		customerProductId: customerProduct.id,
		balance: 0,
	});

	return {
		customer,
		entities: [],
		products: [parentProduct],
		entitlements: [messagesEntitlement, dashboardEntitlement],
		prices: [messagesPrice],
		customerProducts: [customerProduct],
		customerPrices: [customerPrice],
		customerEntitlements: [meteredCe, booleanCe],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [],
			internalEntityIds: [],
			productInternalIds: [parentProduct.internal_id],
			productIds: [parentProduct.id],
			subscriptionIds: [],
		},
	};
};

export const buildCustomerLooseEntitlementScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, messagesFeature } = buildBaseCustomerScenario({
		ctx,
		name,
	});
	const looseProduct = buildProduct({ ctx, key, suffix: "loose-holder" });
	const looseEntitlement = buildEntitlement({
		ctx,
		product: looseProduct,
		feature: messagesFeature,
		key,
		suffix: "loose",
	});
	const looseCe = buildCustomerEntitlement({
		customer,
		entitlement: looseEntitlement,
		key,
		suffix: "loose",
		customerProductId: null,
		balance: 33,
	});

	return {
		customer,
		entities: [],
		products: [looseProduct],
		entitlements: [looseEntitlement],
		prices: [],
		customerProducts: [],
		customerPrices: [],
		customerEntitlements: [looseCe],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [],
			internalEntityIds: [],
			productInternalIds: [looseProduct.internal_id],
			productIds: [looseProduct.id],
			subscriptionIds: [],
		},
	};
};

export const buildCustomerWithInvoicesAndSubscriptionsScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const scenario = buildCustomerMeteredScenario({ ctx, name });
	const subscription = buildSubscription({
		ctx,
		key: scenario.ids.internalCustomerId,
		suffix: "main",
	});
	const customerProduct = {
		...scenario.customerProducts[0],
		subscription_ids: [subscription.stripe_id ?? ""],
	};
	const invoice = buildInvoice({
		customer: scenario.customer,
		key: scenario.ids.internalCustomerId,
		suffix: "main",
		product: scenario.products[0],
	});

	return {
		...scenario,
		customerProducts: [customerProduct],
		subscriptions: [subscription],
		invoices: [invoice],
		ids: {
			...scenario.ids,
			subscriptionIds: [subscription.id],
		},
	};
};

export const buildCustomerWithEntityBoundDataScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, parentProduct, messagesFeature } =
		buildBaseCustomerScenario({ ctx, name });
	const entity = buildEntity({ ctx, customer, key, index: 1 });
	const entityProduct = buildProduct({ ctx, key, suffix: "entity" });

	const parentEntitlement = buildEntitlement({
		ctx,
		product: parentProduct,
		feature: messagesFeature,
		key,
		suffix: "parent",
	});
	const entityEntitlement = buildEntitlement({
		ctx,
		product: entityProduct,
		feature: messagesFeature,
		key,
		suffix: "entity",
		entityFeatureId: entity.feature_id ?? null,
	});

	const parentPrice = buildPrice({
		ctx,
		product: parentProduct,
		entitlement: parentEntitlement,
		key,
		suffix: "parent",
	});
	const entityPrice = buildPrice({
		ctx,
		product: entityProduct,
		entitlement: entityEntitlement,
		key,
		suffix: "entity",
	});

	const parentCp = buildCustomerProduct({
		customer,
		product: parentProduct,
		key,
		suffix: "parent",
	});
	const entityCp = buildCustomerProduct({
		customer,
		product: entityProduct,
		key,
		suffix: "entity",
		internalEntityId: entity.internal_id,
		entityId: entity.id ?? null,
	});

	const parentCpr = buildCustomerPrice({
		customer,
		customerProduct: parentCp,
		price: parentPrice,
		key,
		suffix: "parent",
	});
	const entityCpr = buildCustomerPrice({
		customer,
		customerProduct: entityCp,
		price: entityPrice,
		key,
		suffix: "entity",
	});

	const parentCe = buildCustomerEntitlement({
		customer,
		entitlement: parentEntitlement,
		key,
		suffix: "parent",
		customerProductId: parentCp.id,
		balance: 50,
	});
	const entityCe = buildCustomerEntitlement({
		customer,
		entitlement: entityEntitlement,
		key,
		suffix: "entity",
		customerProductId: entityCp.id,
		internalEntityId: entity.internal_id,
		balance: 25,
	});

	return {
		customer,
		entities: [entity],
		products: [parentProduct, entityProduct],
		entitlements: [parentEntitlement, entityEntitlement],
		prices: [parentPrice, entityPrice],
		customerProducts: [parentCp, entityCp],
		customerPrices: [parentCpr, entityCpr],
		customerEntitlements: [parentCe, entityCe],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [entity.id ?? ""],
			internalEntityIds: [entity.internal_id],
			productInternalIds: [
				parentProduct.internal_id,
				entityProduct.internal_id,
			],
			productIds: [parentProduct.id, entityProduct.id],
			subscriptionIds: [],
		},
	};
};

export const buildBooleanOnlyScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, parentProduct, dashboardFeature } =
		buildBaseCustomerScenario({ ctx, name });

	const dashboardEntitlement = buildEntitlement({
		ctx,
		product: parentProduct,
		feature: dashboardFeature,
		key,
		suffix: "dashboard",
	});

	const customerProduct = buildCustomerProduct({
		customer,
		product: parentProduct,
		key,
		suffix: "parent",
	});

	const booleanCe = buildCustomerEntitlement({
		customer,
		entitlement: dashboardEntitlement,
		key,
		suffix: "dashboard",
		customerProductId: customerProduct.id,
		balance: 0,
	});

	return {
		customer,
		entities: [],
		products: [parentProduct],
		entitlements: [dashboardEntitlement],
		prices: [],
		customerProducts: [customerProduct],
		customerPrices: [],
		customerEntitlements: [booleanCe],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [],
			internalEntityIds: [],
			productInternalIds: [parentProduct.internal_id],
			productIds: [parentProduct.id],
			subscriptionIds: [],
		},
	};
};

export const buildProductAndLooseSameFeatureScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const base = buildCustomerMeteredScenario({ ctx, name });
	const looseProduct = buildProduct({
		ctx,
		key: base.ids.internalCustomerId,
		suffix: "loose-holder",
	});
	const looseEntitlement = buildEntitlement({
		ctx,
		product: looseProduct,
		feature: requireFeature({ ctx, featureId: TestFeature.Messages }),
		key: base.ids.internalCustomerId,
		suffix: "loose",
	});
	const looseCe = buildCustomerEntitlement({
		customer: base.customer,
		entitlement: looseEntitlement,
		key: base.ids.internalCustomerId,
		suffix: "loose",
		customerProductId: null,
		balance: 12,
	});

	return {
		...base,
		products: [...base.products, looseProduct],
		entitlements: [...base.entitlements, looseEntitlement],
		customerEntitlements: [...base.customerEntitlements, looseCe],
		ids: {
			...base.ids,
			productInternalIds: [
				...base.ids.productInternalIds,
				looseProduct.internal_id,
			],
			productIds: [...base.ids.productIds, looseProduct.id],
		},
	};
};

export const buildBooleanMeteredLooseScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const mixed = buildCustomerMixedBooleanMeteredScenario({ ctx, name });
	const looseProduct = buildProduct({
		ctx,
		key: mixed.ids.internalCustomerId,
		suffix: "loose-holder",
	});
	const looseEntitlement = buildEntitlement({
		ctx,
		product: looseProduct,
		feature: requireFeature({ ctx, featureId: TestFeature.Messages }),
		key: mixed.ids.internalCustomerId,
		suffix: "loose",
	});
	const looseCe = buildCustomerEntitlement({
		customer: mixed.customer,
		entitlement: looseEntitlement,
		key: mixed.ids.internalCustomerId,
		suffix: "loose",
		customerProductId: null,
		balance: 7,
	});

	return {
		...mixed,
		products: [...mixed.products, looseProduct],
		entitlements: [...mixed.entitlements, looseEntitlement],
		customerEntitlements: [...mixed.customerEntitlements, looseCe],
		ids: {
			...mixed.ids,
			productInternalIds: [
				...mixed.ids.productInternalIds,
				looseProduct.internal_id,
			],
			productIds: [...mixed.ids.productIds, looseProduct.id],
		},
	};
};

export const buildNoCustomerProductsScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const key = buildUniqueKey({ name });
	const customer = buildCustomer({ ctx, key });

	return {
		customer,
		entities: [],
		products: [],
		entitlements: [],
		prices: [],
		customerProducts: [],
		customerPrices: [],
		customerEntitlements: [],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [],
			internalEntityIds: [],
			productInternalIds: [],
			productIds: [],
			subscriptionIds: [],
		},
	};
};

export const buildOnlyEntityBoundProductScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}) => {
	const scenario = buildCustomerWithEntityBoundDataScenario({ ctx, name });
	return {
		...scenario,
		customerProducts: [scenario.customerProducts[1]!],
		customerPrices: [scenario.customerPrices[1]!],
		customerEntitlements: [scenario.customerEntitlements[1]!],
		products: [scenario.products[1]!],
		entitlements: [scenario.entitlements[1]!],
		prices: [scenario.prices[1]!],
		ids: {
			...scenario.ids,
			productInternalIds: [scenario.ids.productInternalIds[1]!],
			productIds: [scenario.ids.productIds[1]!],
		},
	} satisfies FullSubjectScenario;
};

export const buildEntitySubjectScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, parentProduct, messagesFeature } =
		buildBaseCustomerScenario({ ctx, name });
	const entityA = buildEntity({ ctx, customer, key, index: 1 });
	const entityB = buildEntity({ ctx, customer, key, index: 2 });
	const entityProductA = buildProduct({ ctx, key, suffix: "entityA" });
	const entityProductB = buildProduct({ ctx, key, suffix: "entityB" });

	const parentEntitlement = buildEntitlement({
		ctx,
		product: parentProduct,
		feature: messagesFeature,
		key,
		suffix: "parent",
	});
	const entA = buildEntitlement({
		ctx,
		product: entityProductA,
		feature: messagesFeature,
		key,
		suffix: "entityA",
		entityFeatureId: entityA.feature_id ?? null,
	});
	const entB = buildEntitlement({
		ctx,
		product: entityProductB,
		feature: messagesFeature,
		key,
		suffix: "entityB",
		entityFeatureId: entityB.feature_id ?? null,
	});

	const priceParent = buildPrice({
		ctx,
		product: parentProduct,
		entitlement: parentEntitlement,
		key,
		suffix: "parent",
	});
	const priceA = buildPrice({
		ctx,
		product: entityProductA,
		entitlement: entA,
		key,
		suffix: "entityA",
	});
	const priceB = buildPrice({
		ctx,
		product: entityProductB,
		entitlement: entB,
		key,
		suffix: "entityB",
	});

	const cpParent = buildCustomerProduct({
		customer,
		product: parentProduct,
		key,
		suffix: "parent",
	});
	const cpA = buildCustomerProduct({
		customer,
		product: entityProductA,
		key,
		suffix: "entityA",
		internalEntityId: entityA.internal_id,
		entityId: entityA.id ?? null,
	});
	const cpB = buildCustomerProduct({
		customer,
		product: entityProductB,
		key,
		suffix: "entityB",
		internalEntityId: entityB.internal_id,
		entityId: entityB.id ?? null,
	});

	const cprParent = buildCustomerPrice({
		customer,
		customerProduct: cpParent,
		price: priceParent,
		key,
		suffix: "parent",
	});
	const cprA = buildCustomerPrice({
		customer,
		customerProduct: cpA,
		price: priceA,
		key,
		suffix: "entityA",
	});
	const cprB = buildCustomerPrice({
		customer,
		customerProduct: cpB,
		price: priceB,
		key,
		suffix: "entityB",
	});

	const ceParent = buildCustomerEntitlement({
		customer,
		entitlement: parentEntitlement,
		key,
		suffix: "parent",
		customerProductId: cpParent.id,
		balance: 50,
	});
	const ceA = buildCustomerEntitlement({
		customer,
		entitlement: entA,
		key,
		suffix: "entityA",
		customerProductId: cpA.id,
		internalEntityId: entityA.internal_id,
		balance: 20,
	});
	const ceB = buildCustomerEntitlement({
		customer,
		entitlement: entB,
		key,
		suffix: "entityB",
		customerProductId: cpB.id,
		internalEntityId: entityB.internal_id,
		balance: 10,
	});

	return {
		customer,
		entities: [entityA, entityB],
		products: [parentProduct, entityProductA, entityProductB],
		entitlements: [parentEntitlement, entA, entB],
		prices: [priceParent, priceA, priceB],
		customerProducts: [cpParent, cpA, cpB],
		customerPrices: [cprParent, cprA, cprB],
		customerEntitlements: [ceParent, ceA, ceB],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [entityA.id ?? "", entityB.id ?? ""],
			internalEntityIds: [entityA.internal_id, entityB.internal_id],
			productInternalIds: [
				parentProduct.internal_id,
				entityProductA.internal_id,
				entityProductB.internal_id,
			],
			productIds: [parentProduct.id, entityProductA.id, entityProductB.id],
			subscriptionIds: [],
		},
	};
};

export const buildEntitySubjectWithSubscriptionsAndInvoicesScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}) => {
	const scenario = buildEntitySubjectScenario({ ctx, name });
	const subscription = buildSubscription({
		ctx,
		key: scenario.ids.internalCustomerId,
		suffix: "entity",
	});
	const customerProducts = [...scenario.customerProducts];
	customerProducts[0] = {
		...customerProducts[0]!,
		subscription_ids: [subscription.stripe_id ?? ""],
	};
	customerProducts[1] = {
		...customerProducts[1]!,
		subscription_ids: [subscription.stripe_id ?? ""],
	};
	const invoice = buildInvoice({
		customer: scenario.customer,
		key: scenario.ids.internalCustomerId,
		suffix: "entity",
		product: scenario.products[0]!,
		internalEntityId: scenario.ids.internalEntityIds[0]!,
	});

	return {
		...scenario,
		customerProducts,
		subscriptions: [subscription],
		invoices: [invoice],
		ids: {
			...scenario.ids,
			subscriptionIds: [subscription.id],
		},
	} satisfies FullSubjectScenario;
};

export const buildLooseEntityEntitlementScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const { key, customer, messagesFeature } = buildBaseCustomerScenario({
		ctx,
		name,
	});
	const entityA = buildEntity({ ctx, customer, key, index: 1 });
	const entityB = buildEntity({ ctx, customer, key, index: 2 });
	const looseProduct = buildProduct({ ctx, key, suffix: "loose-holder" });
	const looseEntitlement = buildEntitlement({
		ctx,
		product: looseProduct,
		feature: messagesFeature,
		key,
		suffix: "loose",
	});

	const customerLooseCe = buildCustomerEntitlement({
		customer,
		entitlement: looseEntitlement,
		key,
		suffix: "customer-loose",
		customerProductId: null,
		balance: 11,
	});
	const entityALooseCe = buildCustomerEntitlement({
		customer,
		entitlement: looseEntitlement,
		key,
		suffix: "entityA-loose",
		customerProductId: null,
		internalEntityId: entityA.internal_id,
		balance: 20,
	});
	const entityBLooseCe = buildCustomerEntitlement({
		customer,
		entitlement: looseEntitlement,
		key,
		suffix: "entityB-loose",
		customerProductId: null,
		internalEntityId: entityB.internal_id,
		balance: 10,
	});

	return {
		customer,
		entities: [entityA, entityB],
		products: [looseProduct],
		entitlements: [looseEntitlement],
		prices: [],
		customerProducts: [],
		customerPrices: [],
		customerEntitlements: [customerLooseCe, entityALooseCe, entityBLooseCe],
		rollovers: [],
		subscriptions: [],
		invoices: [],
		ids: {
			customerId: customer.id ?? "",
			internalCustomerId: customer.internal_id,
			entityIds: [entityA.id ?? "", entityB.id ?? ""],
			internalEntityIds: [entityA.internal_id, entityB.internal_id],
			productInternalIds: [looseProduct.internal_id],
			productIds: [looseProduct.id],
			subscriptionIds: [],
		},
	};
};

export const buildRolloverScenario = ({
	ctx,
	name,
}: {
	ctx: TestContext;
	name: string;
}): FullSubjectScenario => {
	const scenario = buildCustomerMeteredScenario({ ctx, name });
	const baseCe = scenario.customerEntitlements[0];
	const rolloverA = buildRollover({
		customerEntitlement: baseCe,
		key: scenario.ids.internalCustomerId,
		suffix: "a",
		balance: 20,
		expiresAt: now + 10_000,
	});
	const rolloverB = buildRollover({
		customerEntitlement: baseCe,
		key: scenario.ids.internalCustomerId,
		suffix: "b",
		balance: 10,
		expiresAt: now + 5_000,
	});

	return {
		...scenario,
		rollovers: [rolloverA, rolloverB],
	};
};
