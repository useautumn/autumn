import type { Feature } from "@autumn/shared";
import {
	type BillingInterval,
	BillingMethod,
	findFeatureById,
	formatInterval,
	isFeaturePriceItem,
	itemToBillingInterval,
	itemToBillingIntervalCount,
	itemToBillingMethod,
	matchesPlanItemFilter,
	type PlanItemFilter,
	type ProductItem,
	type ProductV2,
	productV2ToFeatureItems,
} from "@autumn/shared";
import { getPlanFamilyProductVersions } from "./catalogMappingsForm";

export type CatalogItemMappingMatch = {
	product: ProductV2;
	item: ProductItem;
	stripeProductId: string | null;
	planKind: "Base" | "Variant";
};

const BILLING_METHOD_BADGE_LABELS: Record<BillingMethod, string> = {
	[BillingMethod.UsageBased]: "usage-based",
	[BillingMethod.Prepaid]: "prepaid",
};

const getFeatureDisplayName = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId?: string;
}) => {
	if (!featureId) return "item";

	const feature = findFeatureById({
		features,
		featureId,
		errorOnNotFound: false,
	});

	return feature?.name || featureId;
};

const getFilterIntervalText = (filter: PlanItemFilter) => {
	if (!filter.interval) return null;

	return formatInterval({
		interval: filter.interval as BillingInterval,
		intervalCount: filter.interval_count,
		prefix: "",
	});
};

const uniqueValue = <T extends string | number>(
	values: Array<T | undefined>,
) => {
	const uniqueValues = new Set(
		values.filter((value): value is T => Boolean(value)),
	);
	if (uniqueValues.size !== 1) return undefined;
	return [...uniqueValues][0];
};

const getMatchBillingMethod = (matches: CatalogItemMappingMatch[]) =>
	uniqueValue(matches.map(({ item }) => itemToBillingMethod({ item })));

const getMatchIntervalText = (matches: CatalogItemMappingMatch[]) => {
	const intervalKeys = new Set(
		matches.map(({ item }) =>
			JSON.stringify({
				interval: itemToBillingInterval({ item }),
				interval_count: itemToBillingIntervalCount({ item }),
			}),
		),
	);
	if (intervalKeys.size !== 1) return null;

	const firstItem = matches[0]?.item;
	if (!firstItem) return null;

	return formatInterval({
		interval: itemToBillingInterval({ item: firstItem }),
		intervalCount: itemToBillingIntervalCount({ item: firstItem }),
		prefix: "",
	});
};

export const catalogItemFilterToDisplayParts = ({
	filter,
	features,
	matches,
}: {
	filter: PlanItemFilter;
	features: Feature[];
	matches: CatalogItemMappingMatch[];
}) => {
	const featureName = getFeatureDisplayName({
		features,
		featureId: filter.feature_id,
	});
	const billingMethod = filter.billing_method ?? getMatchBillingMethod(matches);
	const interval =
		getFilterIntervalText(filter) ?? getMatchIntervalText(matches);
	const badges = [
		billingMethod ? BILLING_METHOD_BADGE_LABELS[billingMethod] : null,
		interval,
	].filter((badge): badge is string => Boolean(badge));

	return {
		featureName,
		badges,
		title: [featureName, ...badges].join(" "),
	};
};

const getItemStripeProductId = (item: ProductItem) =>
	item.price_config?.stripe_product_id ?? null;

export const getCatalogItemMappingMatches = ({
	base,
	products,
	filter,
}: {
	base: ProductV2;
	products: ProductV2[];
	filter: PlanItemFilter;
}): CatalogItemMappingMatch[] =>
	getPlanFamilyProductVersions({ base, products }).flatMap((product) =>
		productV2ToFeatureItems({ items: product.items })
			.filter(isFeaturePriceItem)
			.filter((item) => matchesPlanItemFilter({ item, filter }))
			.map((item) => ({
				product,
				item,
				stripeProductId: getItemStripeProductId(item),
				planKind: product.id === base.id ? "Base" : "Variant",
			})),
	);

export const filterCatalogItemMatchesByStripeProduct = ({
	matches,
	stripeProductId,
	showAll,
}: {
	matches: CatalogItemMappingMatch[];
	stripeProductId: string | null;
	showAll: boolean;
}) => {
	if (showAll) return matches;
	return matches.filter((match) => match.stripeProductId === stripeProductId);
};
