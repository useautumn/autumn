import { Infinite, isFeatureItem, type ProductItem } from "@autumn/shared";

const isUnlimitedItem = (item: ProductItem) => item.included_usage === Infinite;

/** A free grant with a countable allowance, which an unlimited grant would hide.
 * Priced items are excluded: an unlimited grant plus a metered overage price is
 * a legitimate shape, and the grant is what keeps that usage unbilled. */
const grantsFiniteAllowance = (item: ProductItem) =>
	!isUnlimitedItem(item) && isFeatureItem(item);

/** Global and entity-scoped grants for one feature are independent balances. */
const itemToGrantScope = (item: ProductItem) =>
	item.feature_id ? `${item.feature_id}|${item.entity_feature_id ?? ""}` : "";

/**
 * Drops an unlimited item when the same feature also has a finite grant.
 *
 * Duplicate validation only catches same-interval collisions, so an unlimited
 * lifetime grant survives beside a finite monthly one. The customer then reads
 * as unlimited and the finite allowance is unreachable, which makes setting an
 * allowance on a previously-unlimited feature look like a no-op.
 */
export const supersedeUnlimitedItems = ({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] => {
	const finiteScopes = new Set(
		items.filter(grantsFiniteAllowance).map(itemToGrantScope).filter(Boolean),
	);

	if (finiteScopes.size === 0) return items;

	return items.filter(
		(item) =>
			!(isUnlimitedItem(item) && finiteScopes.has(itemToGrantScope(item))),
	);
};
