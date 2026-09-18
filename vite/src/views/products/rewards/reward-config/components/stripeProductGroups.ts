import type { ProductItem, ProductV2 } from "@autumn/shared";
import { isFeatureItem } from "@/utils/product/getItemType";

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

/** Plans sharing a Stripe product must be selected together. */
const groupKeyOf = (product: ProductV2) =>
	product.stripe_id ?? product.base_id ?? product.id;

export const buildStripeProductGroups = ({
	products,
}: {
	products: ProductV2[];
}): StripeProductGroup[] => {
	const groupsByKey = new Map<string, StripeProductGroup>();
	const seenProducts = new Set<string>();

	for (const product of products) {
		// A plan can arrive from both the latest-versions list and the by-price-id lookup.
		const productKey =
			product.internal_id ?? `${product.id}:${product.version}`;
		if (seenProducts.has(productKey)) continue;
		seenProducts.add(productKey);

		const priceIds = priceItemsOf(product).map((item) => item.price_id);
		if (priceIds.length === 0) continue;

		const key = groupKeyOf(product);
		const group = groupsByKey.get(key) ?? { key, products: [], priceIds: [] };
		group.products.push(product);
		group.priceIds.push(...priceIds);
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
	return `${first.name} + ${rest.length} variant${rest.length > 1 ? "s" : ""}`;
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
