import {
	BillingInterval,
	BillWhen,
	type FullCustomerPrice,
	Infinite,
	type Price,
	PriceType,
} from "@autumn/shared";

/**
 * Create a prepaid price fixture
 */
const createPrepaid = ({
	id,
	featureId,
	internalFeatureId,
	billingUnits = 1,
	stripePriceId,
	entitlementId,
}: {
	id: string;
	featureId: string;
	internalFeatureId?: string;
	billingUnits?: number;
	stripePriceId?: string;
	entitlementId?: string;
}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		billing_type: "usage_in_advance",
		is_custom: false,
		entitlement_id: entitlementId ?? `ent_${featureId}`,
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.InAdvance,
			billing_units: billingUnits,
			internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
			feature_id: featureId,
			usage_tiers: [{ to: Infinite, amount: 10 }],
			interval: BillingInterval.Month,
			stripe_price_id: stripePriceId ?? `stripe_price_${id}`,
		},
	}) as Price;

/**
 * Create a fixed price fixture
 */
const createFixed = ({
	id,
	stripePriceId,
}: {
	id: string;
	stripePriceId?: string;
}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		billing_type: "fixed_cycle",
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		config: {
			type: PriceType.Fixed,
			amount: 100,
			interval: BillingInterval.Month,
			stripe_price_id: stripePriceId ?? `stripe_price_${id}`,
		},
	}) as Price;

/**
 * Create a consumable price fixture
 */
const createConsumable = ({
	id,
	featureId,
	internalFeatureId,
	stripePriceId,
	stripeEmptyPriceId,
	entitlementId,
}: {
	id: string;
	featureId: string;
	internalFeatureId?: string;
	stripePriceId?: string;
	stripeEmptyPriceId?: string;
	entitlementId?: string;
}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		billing_type: "usage_in_arrear",
		is_custom: false,
		entitlement_id: entitlementId ?? `ent_${featureId}`,
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			billing_units: 1,
			internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
			feature_id: featureId,
			usage_tiers: [{ to: Infinite, amount: 1 }],
			interval: BillingInterval.Month,
			stripe_price_id: stripePriceId ?? `stripe_price_${id}`,
			stripe_empty_price_id: stripeEmptyPriceId ?? `stripe_empty_price_${id}`,
		},
	}) as Price;

/**
 * Create an allocated price fixture
 */
const createAllocated = ({
	id,
	featureId,
	internalFeatureId,
	stripePriceId,
	stripeEmptyPriceId,
	entitlementId,
}: {
	id: string;
	featureId: string;
	internalFeatureId?: string;
	stripePriceId?: string;
	stripeEmptyPriceId?: string;
	entitlementId?: string;
}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		billing_type: "in_arrear_prorated",
		is_custom: false,
		entitlement_id: entitlementId ?? `ent_${featureId}`,
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			should_prorate: true, // Required for getBillingType to return InArrearProrated
			billing_units: 1,
			internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
			feature_id: featureId,
			usage_tiers: [{ to: Infinite, amount: 10 }],
			interval: BillingInterval.Month,
			stripe_price_id: stripePriceId ?? `stripe_price_${id}`,
			stripe_empty_price_id: stripeEmptyPriceId ?? `stripe_empty_price_${id}`,
		},
	}) as Price;

/**
 * Create a one-off price fixture
 */
const createOneOff = ({
	id,
	stripePriceId,
	amount = 100,
}: {
	id: string;
	stripePriceId?: string;
	amount?: number;
}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		billing_type: "one_off",
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		config: {
			type: PriceType.Fixed,
			amount,
			interval: BillingInterval.OneOff,
			stripe_price_id: stripePriceId ?? `stripe_price_${id}`,
		},
	}) as Price;

/**
 * Create a customer price fixture
 */
const createCustomer = ({
	price,
	customerProductId,
}: {
	price: Price;
	customerProductId?: string;
}): FullCustomerPrice => ({
	id: `cus_price_${price.id}`,
	internal_customer_id: "cus_internal",
	customer_product_id: customerProductId ?? "cus_prod_test",
	created_at: Date.now(),
	price_id: price.id,
	price,
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const prices = {
	createPrepaid,
	createFixed,
	createConsumable,
	createAllocated,
	createOneOff,
	createCustomer,
} as const;
