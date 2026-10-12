import {
	type ApiPlanItemV1,
	basePriceToKey,
	type DiffedCustomizePlanV1,
	featureOverrideToKey,
	itemsEqualIgnoringFeatureOverride,
	type MigrationRemoveItem,
	type MigrationUpdatePlanCustomize,
	type PlanFilter,
	planItemMatchesFilter,
} from "@autumn/shared";
import type { MigrationTarget } from "./types";

/** Whether any branch of the filter pins a specific version. */
export const isVersionPinned = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): boolean => {
	if (planFilter.$or) {
		return planFilter.$or.some((branch) =>
			isVersionPinned({ planFilter: branch }),
		);
	}
	return planFilter.version !== undefined;
};

/** Sorted copy: planId alphabetical, then version ascending. */
export const sortTargetsByPlanVersion = ({
	targets,
}: {
	targets: MigrationTarget[];
}): MigrationTarget[] =>
	[...targets].sort(
		(left, right) =>
			left.planId.localeCompare(right.planId) || left.version - right.version,
	);

const previousPriceKey = ({
	previousPrice,
}: {
	previousPrice: MigrationTarget["previousPrice"];
}) =>
	previousPrice === null ? "null" : basePriceToKey({ price: previousPrice });

/** Stamp previous_price only when every target shares one base price — one op can't carry mixed previous prices. */
export const stampPreviousPrice = ({
	customize,
	targets,
}: {
	customize: DiffedCustomizePlanV1;
	targets: MigrationTarget[];
}): MigrationUpdatePlanCustomize => {
	if (customize.price === undefined) return customize;

	const uniquePreviousPrices = new Set(
		targets.map((target) =>
			previousPriceKey({ previousPrice: target.previousPrice }),
		),
	);
	if (uniquePreviousPrices.size !== 1) return customize;

	return {
		...customize,
		previous_price: targets[0]!.previousPrice,
	};
};

/** The add a remove filter is replaced by: the only one of its feature, else the one on its cadence. */
const pairedAddItem = ({
	filter,
	customize,
}: {
	filter: MigrationRemoveItem;
	customize: MigrationUpdatePlanCustomize;
}) => {
	const candidates = (customize.add_items ?? []).filter(
		(item) => item.feature_id === filter.feature_id,
	);
	if (candidates.length === 1) return candidates[0];
	return candidates.find(
		(item) =>
			String(item.price?.interval ?? item.reset?.interval) ===
				String(filter.interval) &&
			(item.price?.interval_count ?? item.reset?.interval_count ?? 1) ===
				(filter.interval_count ?? 1),
	);
};

/** Display stamps for one remove filter, set only when every target's matched item agrees. */
const previousFeatureOverrideStamp = ({
	filter,
	customize,
	previousItemSets,
}: {
	filter: MigrationRemoveItem;
	customize: MigrationUpdatePlanCustomize;
	previousItemSets: ApiPlanItemV1[][];
}): Partial<MigrationRemoveItem> => {
	const next = pairedAddItem({ filter, customize });
	const previousItems = previousItemSets.map((items) =>
		items.find((item) => planItemMatchesFilter({ item, filter })),
	);
	const [previous] = previousItems;
	if (!next || !previous || previousItems.some((item) => !item)) return {};

	const keys = new Set(
		previousItems.map((item) => featureOverrideToKey(item?.feature_override)),
	);
	const override = previous.feature_override;
	if (
		keys.size !== 1 ||
		featureOverrideToKey(next.feature_override) ===
			featureOverrideToKey(override)
	)
		return {};

	const onlyOverrideChanged = previousItems.every(
		(item) => item && itemsEqualIgnoringFeatureOverride(item, next),
	);
	return {
		// An empty override records that the old item inherited the credit system's rates.
		previous_feature_override: override ?? {},
		...(onlyOverrideChanged ? { only_feature_override_changed: true } : {}),
	};
};

/** Stamp each remove filter with its previous override when every target shares it and the paired add changes it. */
export const stampPreviousFeatureOverrides = ({
	customize,
	previousItemSets,
}: {
	customize: MigrationUpdatePlanCustomize;
	previousItemSets: ApiPlanItemV1[][];
}): MigrationUpdatePlanCustomize => {
	if (!customize.remove_items || previousItemSets.length === 0)
		return customize;

	return {
		...customize,
		remove_items: customize.remove_items.map((filter) => ({
			...filter,
			...previousFeatureOverrideStamp({
				filter,
				customize,
				previousItemSets,
			}),
		})),
	};
};
