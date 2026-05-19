import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	hasCustomerProductEnded,
} from "@autumn/shared";

export function withEffectiveCustomerProductStatus({
	customerProduct,
	nowMs,
}: {
	customerProduct: FullCusProduct;
	nowMs?: number;
}): FullCusProduct {
	if (!hasCustomerProductEnded(customerProduct, { nowMs })) {
		return customerProduct;
	}

	return { ...customerProduct, status: CusProductStatus.Expired };
}

// Rewrites a customer product so it renders as "alive at nowMs": clears Expired
// status, pre-nowMs cancellations, and future end timestamps. The pinned product
// is always kept so zero-lifetime edges (same-ms upgrades) still render.
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

// Filters main products to those alive at nowMs (with pinned always kept) and
// rewrites them as live. Shared between the products table and feature-usage table.
export function filterAndRewriteAsLiveAt({
	customerProducts,
	nowMs,
	pinnedCusProductId,
}: {
	customerProducts: FullCusProduct[];
	nowMs: number;
	pinnedCusProductId: string | null;
}): FullCusProduct[] {
	return customerProducts
		.filter((cp) => {
			if (cp.id === pinnedCusProductId) return true;
			if (cp.product?.is_add_on) return false;
			const startedBefore = cp.starts_at == null || cp.starts_at <= nowMs;
			const endedAfter = cp.ended_at == null || cp.ended_at > nowMs;
			return startedBefore && endedAfter;
		})
		.map((cp) => rewriteCusProductAsLiveAt(cp, nowMs));
}

// Hides entities created after nowMs (best-effort historical snapshot). The
// pinned entity is always kept so the page never goes blank.
export function filterEntitiesVisibleAt({
	entities,
	nowMs,
	pinnedEntityId,
}: {
	entities: Entity[];
	nowMs: number;
	pinnedEntityId: string | null;
}): Entity[] {
	return entities.filter(
		(e) =>
			e.id === pinnedEntityId ||
			e.internal_id === pinnedEntityId ||
			e.created_at == null ||
			e.created_at <= nowMs,
	);
}
