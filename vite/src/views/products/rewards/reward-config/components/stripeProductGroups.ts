import type { Feature, ProductItem, ProductV2 } from "@autumn/shared";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";

/** One selectable option per Stripe product a coupon can be scoped to. */
export type StripeProductGroup = {
	key: string;
	kind: "plan" | "feature";
	/** Feature name for usage groups; plan groups are named after their lead plan. */
	featureName?: string;
	products: ProductV2[];
	priceIds: string[];
};

export const priceItemsOf = (product: ProductV2) =>
	(product.items ?? []).filter(
		(item): item is ProductItem & { price_id: string } =>
			!isFeatureItem(item) && Boolean(item.price_id),
	);

/**
 * Mirrors the server: fixed prices scope to the plan's Stripe product (shared
 * by its variants), usage prices to the feature's, which is shared org-wide.
 */
const stripeScopeOfItem = ({
	product,
	item,
}: {
	product: ProductV2;
	item: ProductItem;
}) =>
	isFeaturePriceItem(item)
		? { key: `feature:${item.feature_id}`, kind: "feature" as const }
		: {
				key: `plan:${product.stripe_id ?? product.base_id ?? product.id}`,
				kind: "plan" as const,
			};

export const buildStripeProductGroups = ({
	products,
	features = [],
}: {
	products: ProductV2[];
	features?: Feature[];
}): StripeProductGroup[] => {
	const seenProducts = new Set<string>();
	// A plan can arrive from both the latest-versions list and the by-price-id lookup.
	const unique = products.filter((product) => {
		const key = product.internal_id ?? `${product.id}:${product.version}`;
		if (seenProducts.has(key)) return false;
		seenProducts.add(key);
		return priceItemsOf(product).length > 0;
	});

	const groupsByKey = new Map<string, StripeProductGroup>();

	for (const product of unique) {
		for (const item of priceItemsOf(product)) {
			const { key, kind } = stripeScopeOfItem({ product, item });
			const group = groupsByKey.get(key) ?? {
				key,
				kind,
				featureName:
					kind === "feature"
						? (features.find(({ id }) => id === item.feature_id)?.name ??
							item.feature_id ??
							undefined)
						: undefined,
				products: [],
				priceIds: [],
			};
			// Older versions of a plan share its prices' scope but aren't extra plans.
			if (!group.products.some(({ id }) => id === product.id))
				group.products.push(product);
			group.priceIds.push(item.price_id);
			groupsByKey.set(key, group);
		}
	}

	const groups = [...groupsByKey.values()];
	return [
		...groups.filter(({ kind }) => kind === "plan"),
		...groups.filter(({ kind }) => kind === "feature"),
	];
};

export const findGroupForPriceId = ({
	groups,
	priceId,
}: {
	groups: StripeProductGroup[];
	priceId: string;
}) => groups.find((group) => group.priceIds.includes(priceId)) ?? null;

/** The base plan leads the group, so a family reads "Base + N variants". */
const leadProduct = ({ group }: { group: StripeProductGroup }) =>
	group.products.find((product) => !product.base_id) ?? group.products[0];

/** Every sibling is a variant of the lead plan, rather than an unrelated plan sharing a feature. */
const isVariantFamily = ({ group }: { group: StripeProductGroup }) => {
	const lead = leadProduct({ group });
	const familyId = lead.base_id ?? lead.id;
	return group.products
		.filter((product) => product !== lead)
		.every((product) => product.base_id === familyId);
};

export const groupLabel = ({ group }: { group: StripeProductGroup }) =>
	group.featureName ?? leadProduct({ group }).name;

/** The muted "+ N variants" suffix, or null when a group is a single plan. */
export const groupSuffix = ({ group }: { group: StripeProductGroup }) => {
	if (group.kind === "feature") {
		const count = group.products.length;
		return `usage · ${count} plan${count > 1 ? "s" : ""}`;
	}

	const extra = group.products.length - 1;
	if (extra < 1) return null;

	const noun = isVariantFamily({ group }) ? "variant" : "plan";
	return `+ ${extra} ${noun}${extra > 1 ? "s" : ""}`;
};

/** Lists the plans a coupon would reach, base first, one per line. */
export const sharedProductHint = ({ group }: { group: StripeProductGroup }) => {
	if (group.kind === "feature")
		return [
			`Discounts ${group.featureName} usage on:`,
			...group.products.map(({ name }) => `  • ${name}`),
		].join("\n");

	const lead = leadProduct({ group });
	const names = [
		lead.name,
		...group.products
			.filter((product) => product !== lead)
			.map((product) => product.name),
	];

	return [
		"A coupon here applies to:",
		...names.map((name) => `  • ${name}`),
	].join("\n");
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
