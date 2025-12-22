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
}: {
	id: string;
	featureId: string;
	internalFeatureId?: string;
	billingUnits?: number;
}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		billing_type: "usage_in_advance",
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.InAdvance,
			billing_units: billingUnits,
			internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
			feature_id: featureId,
			usage_tiers: [{ to: Infinite, amount: 10 }],
			interval: BillingInterval.Month,
		},
	}) as Price;

export const createMockFixedPrice = ({ id }: { id: string }): Price =>
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
