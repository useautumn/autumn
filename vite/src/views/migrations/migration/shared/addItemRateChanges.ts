import type {
	Feature,
	FeatureConfigOverride,
	ProductItem,
	UpdatePlanOp,
} from "@autumn/shared";
import {
	apiFeatureOverrideToDb,
	findFeatureById,
	matchesPlanItemFilter,
	planItemMatchesFilter,
} from "@autumn/shared";
import {
	diffFeatureOverrideRates,
	featureOverrideRateCardChanges,
	type RateChange,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { planIdsFromFilter } from "../operations/UpdatePlanOpForm";

type CatalogPlan = { id: string; version?: number; items?: ProductItem[] };

type AddItem = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["add_items"]
>[number];

type RemoveFilter = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["remove_items"]
>[number];

/** The override on the catalog item a remove filter takes out; undefined when the op spans plans or versions. */
const catalogItemOverride = ({
	removeFilter,
	op,
	products,
}: {
	removeFilter: RemoveFilter;
	op: UpdatePlanOp;
	products: CatalogPlan[];
}): FeatureConfigOverride | null | undefined => {
	const planIds = planIdsFromFilter(op.plan_filter);
	const version = op.plan_filter.version;
	if (planIds.length !== 1 || typeof version !== "number") return undefined;

	const plan = products.find(
		(product) => product.id === planIds[0] && product.version === version,
	);
	const catalogItem = plan?.items?.find((planItem) =>
		matchesPlanItemFilter({ item: planItem, filter: removeFilter }),
	);
	if (!catalogItem) return undefined;
	return catalogItem.config?.feature_override ?? null;
};

/** Rate rows an added item sets: old → new when its paired remove filter's previous override is known, else its rate card. */
export const addItemRateChanges = ({
	item,
	op,
	products,
	features,
}: {
	item: AddItem;
	op: UpdatePlanOp;
	products: CatalogPlan[];
	features: Feature[];
}): RateChange[] => {
	const removeFilter = op.customize?.remove_items?.find(
		(filter) => filter.feature_id === item.feature_id,
	);
	const next = item.feature_override
		? apiFeatureOverrideToDb(item.feature_override)
		: null;
	const rateCard = () =>
		next ? featureOverrideRateCardChanges({ override: next, features }) : [];
	const diffFrom = (previous: FeatureConfigOverride | null) =>
		diffFeatureOverrideRates({
			previous,
			next,
			creditSystem: findFeatureById({
				features,
				featureId: item.feature_id,
				errorOnNotFound: false,
			}),
			features,
		});

	if (!removeFilter) return rateCard();
	if (removeFilter.previous_feature_override)
		return diffFrom(
			apiFeatureOverrideToDb(removeFilter.previous_feature_override),
		);

	const catalogOverride = catalogItemOverride({ removeFilter, op, products });
	if (catalogOverride === undefined) return rateCard();
	const changes = diffFrom(catalogOverride);
	if (changes.length > 0) return changes;

	// Drafts from before previous_feature_override, on a catalog updated in place, have lost the old rates.
	return planItemMatchesFilter({ item, filter: removeFilter })
		? rateCard()
		: [];
};
