import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	isAnyCreditSystem,
	isOneOffProductV2,
	type ProductItem,
	sortPlanItems,
	splitBooleanItems,
} from "@autumn/shared";
import type { ProductListItem } from "@/hooks/queries/useProductsQuery";

/** Non-boolean items a card shows before collapsing. Booleans get their own
 * threshold in `splitBooleanItems` — they're what actually blow a list up. */
const MAX_VISIBLE_ITEMS = 4;

export interface PlanLicenseSummary {
	id: string;
	name: string;
	included: number;
}

export interface PlanCardModel {
	plan: ProductListItem;
	/** Sibling plans sharing this base — shown as a variant strip, not rows. */
	variants: ProductListItem[];
	/** Licenses this plan hands out per unit (seats, workspaces). */
	licenses: PlanLicenseSummary[];
	items: ProductItem[];
	hiddenItemCount: number;
}

export interface PlanGroup {
	label: string;
	cards: PlanCardModel[];
}

const planLicenses = ({
	plan,
}: {
	plan: ProductListItem;
}): PlanLicenseSummary[] =>
	(plan.licenses ?? []).map((license) => ({
		id: license.id,
		name: license.product?.name ?? license.product?.id ?? "License",
		included: license.included,
	}));

/** Sorted per the shared display order, then trimmed twice: booleans collapse
 * past their own threshold, and what remains caps at MAX_VISIBLE_ITEMS. */
export const visiblePlanItems = ({ items }: { items: ProductItem[] }) => {
	const sorted = sortPlanItems({ items });
	const { visibleItems: shown, collapsedBooleanItems } = splitBooleanItems({
		items: sorted,
	});
	const capped = shown.slice(0, MAX_VISIBLE_ITEMS);

	return {
		items: capped,
		hiddenItemCount:
			shown.length - capped.length + collapsedBooleanItems.length,
	};
};

/**
 * Folds the flat product list into the three structures a catalog actually has:
 * variants collapse onto their base, licenses attach to the plan that hands
 * them out, and what remains splits into the Plans-page sections.
 */
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
		licenses: planLicenses({ plan }),
		...visiblePlanItems({ items: plan.items ?? [] }),
	});

	// A license plan belongs to its parent's card, never a card of its own —
	// same split the Plans page makes with parent_plan_licenses.
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

/** Mirrors the plan-item order in `sortPlanItems`: metered first, booleans
 * last, since booleans are the long tail nobody scans for. */
const featurePriority = (feature: Feature): number => {
	if (feature.type === FeatureType.Boolean) return 2;
	return feature.config?.usage_type === FeatureUsageType.Continuous ? 1 : 0;
};

/** Credit systems are features, but they read as catalog structure — what a
 * credit buys — so they get their own strip rather than sitting in the list.
 * AI systems sort last: they price models, not features, so they read as a
 * different kind of thing. */
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
	/** What one unit of the source feature costs, in credits. */
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

/** What each metered feature costs to use, in this system's credits. */
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

/** AI credit systems price models rather than mapping features, so they have
 * no schema to show — the model count is what says how they're configured. */
export const aiModelCount = ({
	creditSystem,
}: {
	creditSystem: Feature;
}): number => Object.keys(creditSystem.model_markups ?? {}).length;
