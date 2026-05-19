import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
} from "@autumn/shared";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo } from "react";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { filterCustomerProductsByType } from "../components/table/customer-products/customerProductsTableFilters";
import { withEffectiveCustomerProductStatus } from "../utils/effectiveCustomerProductStatus";
import { useEffectiveNow, useIsViewingAsPast } from "./useEffectiveNow";

/**
 * Rewrites a customer product so it renders as "alive at nowMs": clears Expired
 * status, pre-nowMs cancellations, and future end timestamps. Used in view-as mode
 * so downstream filters and detail panels don't show post-nowMs facts.
 */
export function rewriteCusProductAsLiveAt(
	cp: FullCusProduct,
	nowMs: number,
): FullCusProduct {
	let next: FullCusProduct = cp;
	if (next.status === CusProductStatus.Expired) {
		next = { ...next, status: CusProductStatus.Active };
	}
	if (
		next.canceled &&
		(next.canceled_at == null || next.canceled_at >= nowMs)
	) {
		next = { ...next, canceled: false, canceled_at: null };
	}
	if (next.ended_at != null && next.ended_at >= nowMs) {
		next = { ...next, ended_at: null };
	}
	return next;
}

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
	const { entityId } = useEntity();
	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);
	const nowMs = useEffectiveNow();
	const isViewAs = useIsViewingAsPast();
	const pinnedCusProductId = useViewAsStore((s) => s.cusProductId);

	const customerWithEffectiveStatuses = useMemo(() => {
		const effective = customer.customer_products.map((customerProduct) =>
			withEffectiveCustomerProductStatus({ customerProduct, nowMs }),
		);
		// In view-as mode, hide add-ons / one-offs and anything not alive at nowMs.
		// The pinned product is always included so zero-lifetime edges still render.
		// Status + canceled are rewritten so the row renders as "live at nowMs".
		const filtered = isViewAs
			? effective
					.filter((cp) => {
						if (cp.id === pinnedCusProductId) return true;
						if (cp.product.is_add_on) return false;
						const startedBefore = cp.starts_at == null || cp.starts_at <= nowMs;
						const endedAfter = cp.ended_at == null || cp.ended_at > nowMs;
						return startedBefore && endedAfter;
					})
					.map((cp) => rewriteCusProductAsLiveAt(cp, nowMs))
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
		testClockFrozenTimeMs,
		nowMs,
		isViewAs,
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
