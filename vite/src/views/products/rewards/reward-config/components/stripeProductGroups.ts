import type { ProductItem, ProductV2 } from "@autumn/shared";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";

export type StripeProductGroup = {
	key: string;
	products: ProductV2[];
	priceIds: string[];
};

export const priceItemsOf = (product: ProductV2) =>
	(product.items ?? []).filter(
		(item): item is ProductItem & { price_id: string } =>
			!isFeatureItem(item) && Boolean(item.price_id),
	);

/**
 * Mirrors the server: fixed prices scope to the plan's Stripe product, usage
 * prices to the feature's, which is shared org-wide.
 */
const stripeScopeOfItem = ({
	product,
	item,
}: {
	product: ProductV2;
	item: ProductItem;
}) =>
	isFeaturePriceItem(item)
		? `feature:${item.feature_id}`
		: `plan:${product.stripe_id ?? product.base_id ?? product.id}`;

/** Plans reachable through a shared scope must be selected together. */
const buildScopeUnion = ({ products }: { products: ProductV2[] }) => {
	const parents = new Map<string, string>();

	const find = (scope: string): string => {
		const parent = parents.get(scope);
		if (parent === undefined || parent === scope) {
			parents.set(scope, scope);
			return scope;
		}
		const root = find(parent);
		parents.set(scope, root);
		return root;
	};

	const union = (a: string, b: string) => {
		const rootA = find(a);
		const rootB = find(b);
		if (rootA !== rootB) parents.set(rootB, rootA);
	};

	for (const product of products) {
		const scopes = priceItemsOf(product).map((item) =>
			stripeScopeOfItem({ product, item }),
		);
		for (const scope of scopes) union(scopes[0], scope);
	}

	return find;
};

export const buildStripeProductGroups = ({
	products,
}: {
	products: ProductV2[];
}): StripeProductGroup[] => {
	const seenProducts = new Set<string>();
	// A plan can arrive from both the latest-versions list and the by-price-id lookup.
	const unique = products.filter((product) => {
		const key = product.internal_id ?? `${product.id}:${product.version}`;
		if (seenProducts.has(key)) return false;
		seenProducts.add(key);
		return priceItemsOf(product).length > 0;
	});

	const find = buildScopeUnion({ products: unique });
	const groupsByKey = new Map<string, StripeProductGroup>();

	for (const product of unique) {
		const items = priceItemsOf(product);
		const key = find(stripeScopeOfItem({ product, item: items[0] }));
		const group = groupsByKey.get(key) ?? { key, products: [], priceIds: [] };
		group.products.push(product);
		group.priceIds.push(...items.map((item) => item.price_id));
		groupsByKey.set(key, group);
	}

	return [...groupsByKey.values()];
};

export const findGroupForPriceId = ({
	groups,
	priceId,
}: {
	groups: StripeProductGroup[];
	priceId: string;
}) => groups.find((group) => group.priceIds.includes(priceId)) ?? null;

export const groupLabel = ({ group }: { group: StripeProductGroup }) => {
	const [first, ...rest] = group.products;
	if (rest.length === 0) return first.name;
	return `${first.name} + ${rest.length} plan${rest.length > 1 ? "s" : ""}`;
};

export const isGroupSelected = ({
	group,
	priceIds,
}: {
	group: StripeProductGroup;
	priceIds: string[];
}) => group.priceIds.every((id) => priceIds.includes(id));

/** A coupon opened in the legacy partial state expands to its whole group. */
export const expandToFullGroups = ({
	groups,
	priceIds,
}: {
	groups: StripeProductGroup[];
	priceIds: string[];
}) => {
	const expanded = new Set<string>();

	for (const priceId of priceIds) {
		const group = findGroupForPriceId({ groups, priceId });
		if (!group) {
			expanded.add(priceId);
			continue;
		}
		for (const id of group.priceIds) expanded.add(id);
	}

	return [...expanded];
};
