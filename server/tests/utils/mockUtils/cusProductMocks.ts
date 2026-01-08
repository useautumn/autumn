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
	entityId,
	product,
	status = CusProductStatus.Active,
	startsAt,
	endedAt,
}: {
	id?: string;
	productId?: string;
	customerEntitlements?: FullCustomerEntitlement[];
	customerPrices?: FullCustomerPrice[];
	options?: FeatureOptions[];
	subscriptionIds?: string[];
	internalEntityId?: string;
	entityId?: string;
	product?: FullProduct;
	status?: CusProductStatus;
	startsAt?: number;
	endedAt?: number | null;
}): FullCusProduct => ({
	id,
	internal_product_id: `internal_${productId}`,
	product_id: productId,
	internal_customer_id: "cus_internal",
	customer_id: "cus_test",
	internal_entity_id: internalEntityId ?? null,
	entity_id: entityId ?? null,
	created_at: Date.now(),
	status,
	canceled: false,
	starts_at: startsAt ?? Date.now(),
	trial_ends_at: null,
	canceled_at: null,
	ended_at: endedAt ?? null,
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
