import type { Feature, ProductItem, UpdatePlanOp } from "@autumn/shared";
import {
	apiFeatureOverrideToDb,
	findFeatureById,
	matchesPlanItemFilter,
	planItemMatchesFilter,
} from "@autumn/shared";
import {
	featureOverrideRateCardChanges,
	type RateChange,
	replacementRateChanges,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { planIdsFromFilter } from "../operations/UpdatePlanOpForm";

type CatalogPlan = { id: string; version?: number; items?: ProductItem[] };

type AddItem = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["add_items"]
>[number];

/** The remove filter paired with an added item, and the catalog item it takes out when the op targets one plan version. */
const replacedCatalogItem = ({
	item,
	op,
	products,
}: {
	item: AddItem;
	op: UpdatePlanOp;
	products: CatalogPlan[];
}) => {
	const removeFilter = op.customize?.remove_items?.find(
		(filter) => filter.feature_id === item.feature_id,
	);
	const planIds = planIdsFromFilter(op.plan_filter);
	const version = op.plan_filter.version;
	if (!removeFilter || planIds.length !== 1 || typeof version !== "number")
		return undefined;

	const plan = products.find(
		(product) => product.id === planIds[0] && product.version === version,
	);
	const catalogItem = plan?.items?.find((planItem) =>
		matchesPlanItemFilter({ item: planItem, filter: removeFilter }),
	);
	return catalogItem && { catalogItem, removeFilter };
};

/** Rate rows an added item sets, diffed against the catalog item its paired remove filter takes out. */
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
	const replaced = replacedCatalogItem({ item, op, products });
	const next = item.feature_override
		? apiFeatureOverrideToDb(item.feature_override)
		: null;
	const changes = replacementRateChanges({
		replaced: replaced && {
			override: replaced.catalogItem.config?.feature_override ?? null,
		},
		next,
		creditSystem: findFeatureById({
			features,
			featureId: item.feature_id,
			errorOnNotFound: false,
		}),
		features,
	});
	if (changes.length > 0 || !next || !replaced) return changes;

	// A catalog updated in place already holds the new item, so the old rates are gone; show the new card.
	const updatedInPlace = planItemMatchesFilter({
		item,
		filter: replaced.removeFilter,
	});
	return updatedInPlace
		? featureOverrideRateCardChanges({ override: next, features })
		: [];
};
