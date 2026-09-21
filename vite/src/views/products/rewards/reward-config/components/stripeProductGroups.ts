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

/** Every sibling is a variant of the first plan, rather than an unrelated plan sharing a feature. */
const isVariantFamily = ({ group }: { group: StripeProductGroup }) => {
	const [first, ...rest] = group.products;
	const familyId = first.base_id ?? first.id;
	return rest.every((product) => product.base_id === familyId);
};

export const groupLabel = ({ group }: { group: StripeProductGroup }) =>
	group.products[0].name;

/** The muted "+ N variants" suffix, or null when a group is a single plan. */
export const groupSuffix = ({ group }: { group: StripeProductGroup }) => {
	const extra = group.products.length - 1;
	if (extra < 1) return null;

	const noun = isVariantFamily({ group }) ? "variant" : "plan";
	return `+ ${extra} ${noun}${extra > 1 ? "s" : ""}`;
};

/** Named plans, so the hint says which ones move together. */
export const sharedProductHint = ({ group }: { group: StripeProductGroup }) =>
	`Shares one Stripe product with ${group.products
		.map((product) => product.name)
		.join(", ")}, so a coupon applies to all of them.`;

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
