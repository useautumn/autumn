import type { Entity, FullCusProduct } from "@autumn/shared";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo } from "react";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import {
	filterCustomerProducts,
	isOneOffCusProduct,
} from "../components/table/customer-products/customerProductsTableFilters";

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
			(!product.internal_entity_id && !product.entity_id) ||
			product.internal_entity_id === selectedEntity.internal_id ||
			product.entity_id === selectedEntity.id,
	);
}

export function useCustomerProductsData() {
	const { customer, isLoading, isFetching, isPlaceholderData, testClockFrozenTimeMs } = useCusQuery();
	const { entityId } = useEntity();
	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);

	const { subscriptions, purchases, hasEntityProducts } = useMemo(() => {
		const allProducts = filterCustomerProducts({ customer, showExpired: showExpired ?? false });
		const filtered = filterBySelectedEntity({
			products: allProducts,
			entityId,
			entities: customer.entities,
		});

		return {
			subscriptions: filtered.filter((p) => !isOneOffCusProduct(p)),
			purchases: filtered.filter((p) => isOneOffCusProduct(p)),
			hasEntityProducts: allProducts.some(
				(p) => p.internal_entity_id || p.entity_id,
			),
		};
	}, [customer, showExpired, entityId]);

	const isEntityTransitioning = isFetching && isPlaceholderData;

	return {
		customer,
		isLoading,
		isEntityTransitioning,
		testClockFrozenTimeMs,
		showExpired,
		setShowExpired,
		entityId,
		hasEntities: customer.entities.length > 0,
		subscriptions: {
			all: subscriptions,
			hasEntityProducts,
		},
		purchases: {
			all: purchases,
			hasEntityProducts,
		},
	};
}
