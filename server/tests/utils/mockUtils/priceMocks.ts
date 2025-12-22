import {
	BillingInterval,
	BillWhen,
	type FullCustomerPrice,
	Infinite,
	type Price,
	PriceType,
} from "@autumn/shared";

export const createMockPrepaidPrice = ({
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

export const createMockFixedPrice = ({
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

export const createMockConsumablePrice = ({
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

export const createMockAllocatedPrice = ({
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
			billing_units: 1,
			internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
			feature_id: featureId,
			usage_tiers: [{ to: Infinite, amount: 10 }],
			interval: BillingInterval.Month,
			stripe_price_id: stripePriceId ?? `stripe_price_${id}`,
			stripe_empty_price_id: stripeEmptyPriceId ?? `stripe_empty_price_${id}`,
		},
	}) as Price;

export const createMockOneOffPrice = ({
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

export const createMockCustomerPrice = ({
	price,
}: {
	price: Price;
}): FullCustomerPrice => ({
	id: `cus_price_${price.id}`,
	internal_customer_id: "cus_internal",
	customer_product_id: "cus_prod_test",
	created_at: Date.now(),
	price_id: price.id,
	price,
});
