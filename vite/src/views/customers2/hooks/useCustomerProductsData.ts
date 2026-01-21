import type { Entity, FullCusProduct } from "@autumn/shared";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo } from "react";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { filterCustomerProductsByType } from "../components/table/customer-products/customerProductsTableFilters";

function filterBySelectedEntity({
	products,
	entityId,
	entities,
}: {
	products: FullCusProduct[];
	entityId: string | null;
	entities: Entity[];
}): FullCusProduct[] {
	if (!entityId) return products;

	const selectedEntity = entities.find(
		(e: Entity) => e.id === entityId || e.internal_id === entityId,
	);

	if (!selectedEntity) return products;

	return products.filter(
		(product) =>
			product.internal_entity_id === selectedEntity.internal_id ||
			product.entity_id === selectedEntity.id,
	);
}

export function useCustomerProductsData() {
	const { customer, isLoading } = useCusQuery();
	const { entityId } = useEntity();
	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);

	const { subscriptions, purchases } = useMemo(
		() =>
			filterCustomerProductsByType({
				customer,
				showExpired: showExpired ?? false,
			}),
		[customer, showExpired],
	);

	// Filter entity-level products by selected entity (if any)
	const filteredSubscriptionsEntityLevel = useMemo(
		() =>
			filterBySelectedEntity({
				products: subscriptions.entityLevel,
				entityId,
				entities: customer.entities,
			}),
		[subscriptions.entityLevel, entityId, customer.entities],
	);

	const filteredPurchasesEntityLevel = useMemo(
		() =>
			filterBySelectedEntity({
				products: purchases.entityLevel,
				entityId,
				entities: customer.entities,
			}),
		[purchases.entityLevel, entityId, customer.entities],
	);

	// Combine customer-level (always shown) + filtered entity-level products
	const allSubscriptions = useMemo(
		() => [...subscriptions.customerLevel, ...filteredSubscriptionsEntityLevel],
		[subscriptions.customerLevel, filteredSubscriptionsEntityLevel],
	);

	const allPurchases = useMemo(
		() => [...purchases.customerLevel, ...filteredPurchasesEntityLevel],
		[purchases.customerLevel, filteredPurchasesEntityLevel],
	);

	return {
		customer,
		isLoading,
		showExpired,
		setShowExpired,
		entityId,
		hasEntities: customer.entities.length > 0,
		subscriptions: {
			all: allSubscriptions,
			hasEntityProducts: subscriptions.entityLevel.length > 0,
		},
		purchases: {
			all: allPurchases,
			hasEntityProducts: purchases.entityLevel.length > 0,
		},
	};
}
