import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	isAnyCreditSystem,
	isOneOffProductV2,
	type ProductItem,
	productV2ToFeatureItems,
	sortPlanItems,
	splitBooleanItems,
} from "@autumn/shared";
import type { ProductListItem } from "@/hooks/queries/useProductsQuery";

const MAX_VISIBLE_ITEMS = 4;

export interface PlanCardModel {
	plan: ProductListItem;
	variants: ProductListItem[];
	items: ProductItem[];
	hiddenItemCount: number;
}

export interface PlanGroup {
	label: string;
	cards: PlanCardModel[];
}

export const visiblePlanItems = ({
	items,
	limit = MAX_VISIBLE_ITEMS,
}: {
	items: ProductItem[];
	limit?: number;
}) => {
	const sorted = sortPlanItems({
		items: productV2ToFeatureItems({ items }),
	});
	const { visibleItems: shown, collapsedBooleanItems } = splitBooleanItems({
		items: sorted,
	});
	const capped = shown.slice(0, limit);

	return {
		items: capped,
		hiddenItemCount:
			shown.length - capped.length + collapsedBooleanItems.length,
	};
};

export const buildPlanGroups = ({
	products,
}: {
	products: ProductListItem[];
}): PlanGroup[] => {
	const byId = new Map(products.map((product) => [product.id, product]));

	const variantsByBase = new Map<string, ProductListItem[]>();
	for (const product of products) {
		if (!product.base_id || !byId.has(product.base_id)) continue;
		const siblings = variantsByBase.get(product.base_id) ?? [];
		siblings.push(product);
		variantsByBase.set(product.base_id, siblings);
	}

	const toCard = (plan: ProductListItem): PlanCardModel => ({
		plan,
		variants: variantsByBase.get(plan.id) ?? [],
		...visiblePlanItems({ items: plan.items ?? [] }),
	});

	const bases = products.filter(
		(product) =>
			!product.base_id && (product.parent_plan_licenses?.length ?? 0) === 0,
	);
	const oneOff = new Set(
		bases.filter((product) =>
			isOneOffProductV2({ items: product.items ?? [] }),
		),
	);

	const groups: PlanGroup[] = [
		{
			label: "Plans",
			cards: bases
				.filter((product) => !oneOff.has(product) && !product.is_add_on)
				.map(toCard),
		},
		{
			label: "Add-ons",
			cards: bases
				.filter((product) => !oneOff.has(product) && product.is_add_on)
				.map(toCard),
		},
		{ label: "One-off", cards: [...oneOff].map(toCard) },
	];

	return groups.filter((group) => group.cards.length > 0);
};

const featurePriority = (feature: Feature): number => {
	if (feature.type === FeatureType.Boolean) return 2;
	return feature.config?.usage_type === FeatureUsageType.Continuous ? 1 : 0;
};

export const splitCreditSystems = ({ features }: { features: Feature[] }) => ({
	creditSystems: features
		.filter((feature) => isAnyCreditSystem(feature.type))
		.sort(
			(a, b) =>
				Number(isAiCreditSystem(a.type)) - Number(isAiCreditSystem(b.type)) ||
				a.name.localeCompare(b.name),
		),
	plainFeatures: features
		.filter((feature) => !isAnyCreditSystem(feature.type))
		.sort(
			(a, b) =>
				featurePriority(a) - featurePriority(b) || a.name.localeCompare(b.name),
		),
});

interface CreditSchemaEntry {
	metered_feature_id: string;
	credit_amount?: number;
	tiers?: { to: number | "inf"; credit_amount: number }[];
}

export interface CreditSource {
	featureId: string;
	name: string;
	cost: string;
}

const creditCost = ({ entry }: { entry: CreditSchemaEntry }): string => {
	if (entry.tiers?.length) {
		const rates = entry.tiers.map((tier) => tier.credit_amount);
		const min = Math.min(...rates);
		const max = Math.max(...rates);
		return min === max ? `${min} credits` : `${min}–${max} credits`;
	}
	if (entry.credit_amount == null) return "";
	return entry.credit_amount === 1
		? "1 credit"
		: `${entry.credit_amount} credits`;
};

export const creditSources = ({
	creditSystem,
	features,
}: {
	creditSystem: Feature;
	features: Feature[];
}): CreditSource[] => {
	const schema = creditSystem.config?.schema as CreditSchemaEntry[] | undefined;
	if (!schema?.length) return [];

	return schema.map((entry) => {
		const source = features.find(
			(feature) => feature.id === entry.metered_feature_id,
		);
		return {
			featureId: entry.metered_feature_id,
			name: source?.name ?? entry.metered_feature_id,
			cost: creditCost({ entry }),
		};
	});
};

export const aiModelCount = ({
	creditSystem,
}: {
	creditSystem: Feature;
}): number => Object.keys(creditSystem.model_markups ?? {}).length;
