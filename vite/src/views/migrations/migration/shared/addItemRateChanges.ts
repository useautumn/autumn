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
	type ItemRateRows,
	pairItemRateRows,
} from "@/components/v2/pairItemRateRows";
import {
	diffFeatureOverrideRates,
	featureOverrideRateCardChanges,
	type RateChange,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { planIdsFromFilter } from "../operations/UpdatePlanOpForm";

export type CatalogPlan = {
	id: string;
	version?: number;
	items?: ProductItem[];
};

export type AddItem = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["add_items"]
>[number];

export type RemoveFilter = NonNullable<
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
	removeFilter,
	op,
	products,
	features,
}: {
	item: AddItem;
	removeFilter: RemoveFilter | undefined;
	op: UpdatePlanOp;
	products: CatalogPlan[];
	features: Feature[];
}): RateChange[] => {
	const next = item.feature_override
		? apiFeatureOverrideToDb(item.feature_override)
		: null;
	const creditSystem = findFeatureById({
		features,
		featureId: item.feature_id,
		errorOnNotFound: false,
	});
	const rateCard = () =>
		next
			? featureOverrideRateCardChanges({
					override: next,
					features,
					creditSystem,
				})
			: [];
	const diffFrom = (previous: FeatureConfigOverride | null) =>
		diffFeatureOverrideRates({ previous, next, creditSystem, features });

	if (!removeFilter) return rateCard();
	if (removeFilter.previous_feature_override)
		return diffFrom(
			apiFeatureOverrideToDb(removeFilter.previous_feature_override),
		);
	// Stamped with no previous override: the old item used the credit system's own rates.
	if (removeFilter.only_feature_override_changed) return diffFrom(null);

	const catalogOverride = catalogItemOverride({ removeFilter, op, products });
	if (catalogOverride === undefined) return rateCard();
	const changes = diffFrom(catalogOverride);
	if (changes.length > 0) return changes;

	// Drafts from before previous_feature_override, on a catalog updated in place, have lost the old rates.
	return planItemMatchesFilter({ item, filter: removeFilter })
		? rateCard()
		: [];
};

/** A remove filter matches an added item's cadence: same interval and interval count. */
export const migrationItemSameCadence = ({
	add,
	remove,
}: {
	add: AddItem;
	remove: RemoveFilter;
}) =>
	String(add.price?.interval ?? add.reset?.interval) ===
		String(remove.interval) &&
	(add.price?.interval_count ?? add.reset?.interval_count ?? 1) ===
		(remove.interval_count ?? 1);

/** An op's added items as rate rows; a pair the draft stamped as override-only becomes one updated row. */
export const migrationOpRateRows = ({
	op,
	products,
	features,
}: {
	op: UpdatePlanOp;
	products: CatalogPlan[];
	features: Feature[];
}): ItemRateRows =>
	pairItemRateRows({
		adds: op.customize?.add_items ?? [],
		removes: op.customize?.remove_items ?? [],
		sameCadence: migrationItemSameCadence,
		compare: ({ add, remove }) => ({
			changes: addItemRateChanges({
				item: add,
				removeFilter: remove,
				op,
				products,
				features,
			}),
			onlyRateCardChanged: remove?.only_feature_override_changed === true,
		}),
	});
