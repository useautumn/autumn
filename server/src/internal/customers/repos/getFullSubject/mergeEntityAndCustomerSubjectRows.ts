import type { SubjectQueryRow } from "@autumn/shared";
import {
	CUSTOMER_PRODUCT_LIMIT,
	EXTRA_CUSTOMER_ENTITLEMENT_LIMIT,
} from "./getFullSubjectRowsQuery.js";

const dedupeBy = <T>(rows: T[], getKey: (row: T) => string): T[] => {
	const seen = new Map<string, T>();
	for (const row of rows) {
		if (!seen.has(getKey(row))) seen.set(getKey(row), row);
	}
	return [...seen.values()];
};

/** Dedupe, keep only referenced rows, and sort by key to mirror the SQL's DISTINCT ON ... ORDER BY output. */
const mergeCatalog = <T>(
	rows: T[],
	getKey: (row: T) => string,
	keptKeys: Set<string | null>,
): T[] =>
	dedupeBy(rows, getKey)
		.filter((row) => keptKeys.has(getKey(row)))
		.sort((left, right) => (getKey(left) < getKey(right) ? -1 : 1));

/**
 * Recombines an entityScopedOnly subject row with its customer's
 * customer-level row into the SubjectQueryRow the combined query would
 * produce. Entity rows concat before customer rows (subject_entity_priority
 * leads the SQL ranking), the caps apply to the combined arrays, and since
 * the SQL derives every other array AFTER the caps, rows referencing
 * capped-out customer products are dropped here too.
 */
export const mergeEntityAndCustomerSubjectRows = ({
	entityRow,
	customerRow,
}: {
	entityRow: SubjectQueryRow;
	customerRow: SubjectQueryRow | undefined;
}): SubjectQueryRow => {
	if (!customerRow) return entityRow;

	const customerProducts = [
		...entityRow.customer_products,
		...customerRow.customer_products,
	].slice(0, CUSTOMER_PRODUCT_LIMIT);

	const extraCustomerEntitlements = [
		...entityRow.extra_customer_entitlements,
		...customerRow.extra_customer_entitlements,
	].slice(0, EXTRA_CUSTOMER_ENTITLEMENT_LIMIT);

	const keptProductIds = new Set<string | null>(
		customerProducts.map((product) => product.id),
	);

	const customerEntitlements = [
		...entityRow.customer_entitlements,
		...customerRow.customer_entitlements,
	].filter((entitlement) => keptProductIds.has(entitlement.customer_product_id));

	const customerPrices = [
		...entityRow.customer_prices,
		...customerRow.customer_prices,
	].filter((price) => keptProductIds.has(price.customer_product_id));

	const keptCusEntIds = new Set(
		[...customerEntitlements, ...extraCustomerEntitlements].map((ce) => ce.id),
	);
	const keptRefs = {
		products: new Set<string | null>(
			customerProducts.map((p) => p.internal_product_id),
		),
		prices: new Set<string | null>(customerPrices.map((p) => p.price_id)),
		entitlements: new Set<string | null>(
			[...customerEntitlements, ...extraCustomerEntitlements].map(
				(ce) => ce.entitlement_id,
			),
		),
		freeTrials: new Set<string | null>(
			customerProducts.map((p) => p.free_trial_id),
		),
		subscriptionIds: new Set(
			customerProducts.flatMap((p) => p.subscription_ids ?? []),
		),
	};

	return {
		customer: entityRow.customer,
		entity: entityRow.entity,
		customer_products: customerProducts,
		customer_entitlements: customerEntitlements,
		customer_prices: customerPrices,
		extra_customer_entitlements: extraCustomerEntitlements,
		rollovers: [...entityRow.rollovers, ...customerRow.rollovers].filter(
			(rollover) => keptCusEntIds.has(rollover.cus_ent_id),
		),
		replaceables: [
			...entityRow.replaceables,
			...customerRow.replaceables,
		].filter((replaceable) => keptCusEntIds.has(replaceable.cus_ent_id)),
		products: mergeCatalog(
			[...entityRow.products, ...customerRow.products],
			(p) => p.internal_id,
			keptRefs.products,
		),
		entitlements: dedupeBy(
			[...entityRow.entitlements, ...customerRow.entitlements],
			(e) => e.id,
		).filter((e) => keptRefs.entitlements.has(e.id)),
		prices: mergeCatalog(
			[...entityRow.prices, ...customerRow.prices],
			(p) => p.id,
			keptRefs.prices,
		),
		free_trials: mergeCatalog(
			[...entityRow.free_trials, ...customerRow.free_trials],
			(ft) => ft.id,
			keptRefs.freeTrials,
		),
		subscriptions: dedupeBy(
			[...entityRow.subscriptions, ...customerRow.subscriptions],
			(s) => s.stripe_id ?? "",
		).filter(
			(s) =>
				s.stripe_id !== null && keptRefs.subscriptionIds.has(s.stripe_id),
		),
	};
};
