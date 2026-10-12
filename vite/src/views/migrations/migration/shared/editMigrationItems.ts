import type { UpdatePlanOp } from "@autumn/shared";
import { itemsEqualIgnoringFeatureOverride } from "@autumn/shared";
import { pairRemoveIndices } from "@/components/v2/pairItemRateRows";
import {
	type AddItem,
	migrationItemSameCadence,
	type RemoveFilter,
} from "./addItemRateChanges";

type Customize = NonNullable<UpdatePlanOp["customize"]>;

const withoutStamps = ({
	previous_feature_override: _previous,
	only_feature_override_changed: _only,
	...filter
}: RemoveFilter) => filter;

const withoutOnlyOverrideFlag = ({
	only_feature_override_changed: _only,
	...filter
}: RemoveFilter) => filter;

/** Replaces one added item. The item editor can't edit overrides, so the old one is kept; any other change un-merges its pair. */
export const withEditedAddItem = ({
	customize,
	addIndex,
	item,
}: {
	customize: Customize | undefined;
	addIndex: number;
	item: AddItem;
}): Customize => {
	const addItems = customize?.add_items ?? [];
	const removeItems = customize?.remove_items ?? [];
	const previous = addItems[addIndex];
	const next: AddItem = {
		...item,
		...(previous?.feature_override && !item.feature_override
			? { feature_override: previous.feature_override }
			: {}),
	};
	const removeIndex = pairRemoveIndices({
		adds: addItems,
		removes: removeItems,
		sameCadence: migrationItemSameCadence,
	})[addIndex];
	const stillOnlyOverride =
		!!previous && itemsEqualIgnoringFeatureOverride(previous, next);

	return {
		...customize,
		add_items: addItems.map((current, index) =>
			index === addIndex ? next : current,
		),
		...(customize?.remove_items
			? {
					remove_items: removeItems.map((filter, index) =>
						index === removeIndex && !stillOnlyOverride
							? withoutOnlyOverrideFlag(filter)
							: filter,
					),
				}
			: {}),
	};
};

/** A remove filter edited to match different items no longer describes the old item, so its display stamps go. */
export const withEditedRemoveFilter = ({
	previous,
	next,
}: {
	previous: RemoveFilter;
	next: RemoveFilter;
}): RemoveFilter =>
	JSON.stringify(withoutStamps(previous)) ===
	JSON.stringify(withoutStamps(next))
		? next
		: withoutStamps(next);
