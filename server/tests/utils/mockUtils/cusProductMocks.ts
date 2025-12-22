import {
	CollectionMethod,
	CusProductStatus,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	type FullProduct,
} from "@autumn/shared";
import { createMockFullProduct } from "./productMocks";

export const createMockCustomerProduct = ({
	id = "cus_prod_test",
	productId = "prod_test",
	customerEntitlements = [],
	customerPrices = [],
	options = [],
	subscriptionIds = [],
	internalEntityId,
	product,
}: {
	id?: string;
	productId?: string;
	customerEntitlements?: FullCustomerEntitlement[];
	customerPrices?: FullCustomerPrice[];
	options?: FeatureOptions[];
	subscriptionIds?: string[];
	internalEntityId?: string;
	product?: FullProduct;
}): FullCusProduct => ({
	id,
	internal_product_id: `internal_${productId}`,
	product_id: productId,
	internal_customer_id: "cus_internal",
	customer_id: "cus_test",
	internal_entity_id: internalEntityId ?? null,
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
	subscription_ids: subscriptionIds,
	scheduled_ids: [],
	quantity: 1,
	api_semver: null,
	is_custom: false,
	customer_prices: customerPrices,
	customer_entitlements: customerEntitlements,
	product: product ?? (createMockFullProduct({ id: productId }) as FullProduct),
	free_trial: null,
});
