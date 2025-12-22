import {
	CollectionMethod,
	CusProductStatus,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
} from "@autumn/shared";
import { createMockProduct } from "./productMocks";

export const createMockCustomerProduct = ({
	customerEntitlements = [],
	customerPrices = [],
	options = [],
}: {
	customerEntitlements?: FullCustomerEntitlement[];
	customerPrices?: FullCustomerPrice[];
	options?: FeatureOptions[];
}): FullCusProduct => ({
	id: "cus_prod_test",
	internal_product_id: "prod_internal",
	product_id: "prod_test",
	internal_customer_id: "cus_internal",
	customer_id: "cus_test",
	internal_entity_id: null,
	entity_id: null,
	created_at: Date.now(),
	status: CusProductStatus.Active,
	canceled: false,
	starts_at: Date.now(),
	trial_ends_at: null,
	canceled_at: null,
	ended_at: null,
	options,
	free_trial_id: null,
	collection_method: CollectionMethod.ChargeAutomatically,
	subscription_ids: [],
	scheduled_ids: [],
	quantity: 1,
	api_semver: null,
	is_custom: false,
	customer_prices: customerPrices,
	customer_entitlements: customerEntitlements,
	product: createMockProduct(),
	free_trial: null,
});
