import type { Entity, FullCusProduct } from "@autumn/shared";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo } from "react";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { filterCustomerProductsByType } from "../components/table/customer-products/customerProductsTableFilters";
import {
	filterAndRewriteAsLiveAt,
	filterEntitiesVisibleAt,
	withEffectiveCustomerProductStatus,
} from "../utils/effectiveCustomerProductStatus";
import {
	useEffectiveEntityId,
	useEffectiveNow,
	useIsViewingAsPast,
} from "./useEffectiveNow";

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
	const { customer, isLoading, testClockFrozenTimeMs } = useCusQuery();
	const entityId = useEffectiveEntityId();
	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);
	const nowMs = useEffectiveNow();
	const isViewAs = useIsViewingAsPast();
	const pinnedCusProductId = useViewAsStore((s) => s.cusProductId);
	const pinnedEntityId = useViewAsStore((s) => s.entityId);

	const visibleEntities = useMemo(() => {
		const entities: Entity[] = customer?.entities ?? [];
		if (!isViewAs) return entities;
		return filterEntitiesVisibleAt({
			entities,
			nowMs,
			pinnedEntityId,
		});
	}, [customer?.entities, isViewAs, nowMs, pinnedEntityId]);

	const customerWithEffectiveStatuses = useMemo(() => {
		const effective = (customer?.customer_products ?? []).map(
			(customerProduct: FullCusProduct) =>
				withEffectiveCustomerProductStatus({ customerProduct, nowMs }),
		);
		const filtered = isViewAs
			? filterAndRewriteAsLiveAt({
					customerProducts: effective,
					nowMs,
					pinnedCusProductId,
				})
			: effective;
		return { ...customer, customer_products: filtered };
	}, [customer, nowMs, isViewAs, pinnedCusProductId]);

	const { subscriptions, purchases } = useMemo(
		() =>
			filterCustomerProductsByType({
				customer: customerWithEffectiveStatuses,
				// In view-as mode the upstream filter is authoritative; let everything through.
				showExpired: isViewAs ? true : (showExpired ?? false),
			}),
		[customerWithEffectiveStatuses, showExpired, isViewAs],
	);

	const filteredSubscriptionsEntityLevel = useMemo(
		() =>
			filterBySelectedEntity({
				products: subscriptions.entityLevel,
				entityId,
				entities: visibleEntities,
			}),
		[subscriptions.entityLevel, entityId, visibleEntities],
	);

	const filteredPurchasesEntityLevel = useMemo(
		() =>
			filterBySelectedEntity({
				products: purchases.entityLevel,
				entityId,
				entities: visibleEntities,
			}),
		[purchases.entityLevel, entityId, visibleEntities],
	);

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
		testClockFrozenTimeMs,
		nowMs,
		isViewAs,
		showExpired,
		setShowExpired,
		entityId,
		hasEntities: visibleEntities.length > 0,
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
