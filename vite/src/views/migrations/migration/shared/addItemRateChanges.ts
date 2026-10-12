import type { Feature, ProductItem, UpdatePlanOp } from "@autumn/shared";
import {
	apiFeatureOverrideToDb,
	findFeatureById,
	matchesPlanItemFilter,
} from "@autumn/shared";
import {
	type RateChange,
	replacementRateChanges,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { planIdsFromFilter } from "../operations/UpdatePlanOpForm";

type CatalogPlan = { id: string; version?: number; items?: ProductItem[] };

type AddItem = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["add_items"]
>[number];

/** The catalog item a paired remove filter takes out, when the op targets one plan version. */
const replacedCatalogItem = ({
	item,
	op,
	products,
}: {
	item: AddItem;
	op: UpdatePlanOp;
	products: CatalogPlan[];
}): ProductItem | undefined => {
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
	return plan?.items?.find((planItem) =>
		matchesPlanItemFilter({ item: planItem, filter: removeFilter }),
	);
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
	return replacementRateChanges({
		replaced: replaced && {
			override: replaced.config?.feature_override ?? null,
		},
		next: item.feature_override
			? apiFeatureOverrideToDb(item.feature_override)
			: null,
		creditSystem: findFeatureById({
			features,
			featureId: item.feature_id,
			errorOnNotFound: false,
		}),
		features,
	});
};
