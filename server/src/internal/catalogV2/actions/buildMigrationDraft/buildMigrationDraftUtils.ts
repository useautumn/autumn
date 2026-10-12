import {
	type ApiPlanItemV1,
	basePriceToKey,
	type DiffedCustomizePlanV1,
	featureOverrideToKey,
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
	previousPrice === null
		? "null"
		: basePriceToKey({ price: previousPrice });

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

const previousFeatureOverride = ({
	filter,
	customize,
	previousItemSets,
}: {
	filter: MigrationRemoveItem;
	customize: MigrationUpdatePlanCustomize;
	previousItemSets: ApiPlanItemV1[][];
}) => {
	const previous = previousItemSets.map(
		(items) =>
			items.find((item) => planItemMatchesFilter({ item, filter }))
				?.feature_override,
	);
	const keys = new Set(
		previous.map((override) => featureOverrideToKey(override)),
	);
	const [override] = previous;
	if (!override || keys.size !== 1) return undefined;

	const next = customize.add_items?.find(
		(item) => item.feature_id === filter.feature_id,
	)?.feature_override;
	return featureOverrideToKey(next) === featureOverrideToKey(override)
		? undefined
		: override;
};

/** Stamp each remove filter's previous_feature_override when every target shares it and the paired add changes it. */
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
		remove_items: customize.remove_items.map((filter) => {
			const override = previousFeatureOverride({
				filter,
				customize,
				previousItemSets,
			});
			return override
				? { ...filter, previous_feature_override: override }
				: filter;
		}),
	};
};
