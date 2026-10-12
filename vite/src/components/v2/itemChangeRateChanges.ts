import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
import {
	apiFeatureOverrideToDb,
	findFeatureById,
	itemsEqualIgnoringFeatureOverride,
} from "@autumn/shared";
import { replacementRateChanges } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { type ItemRateRows, pairItemRateRows } from "./pairItemRateRows";

type ItemChange = Partial<PlanItemChangeV0>;

const itemOverride = (change: ItemChange) =>
	change.item?.feature_override
		? apiFeatureOverrideToDb(change.item.feature_override)
		: null;

const itemCadence = ({ item }: ItemChange) => {
	const interval = item?.price?.interval ?? item?.reset?.interval;
	const count = item?.price?.interval_count ?? item?.reset?.interval_count;
	return `${interval ?? ""}|${count ?? 1}`;
};

/** Created items as rate rows: each diffed against the deleted item of the same feature. */
export const itemChangeRateRows = <T extends ItemChange>({
	itemChanges,
	features,
}: {
	itemChanges: T[];
	features: Feature[];
}): ItemRateRows & { created: T[]; deleted: T[] } => {
	const created = itemChanges.filter((change) => change.action === "created");
	const deleted = itemChanges.filter((change) => change.action === "deleted");
	return {
		created,
		deleted,
		...pairItemRateRows({
			adds: created,
			removes: deleted,
			sameCadence: ({ add, remove }) =>
				itemCadence(add) === itemCadence(remove),
			compare: ({ add, remove }) => ({
				changes: replacementRateChanges({
					replaced: remove && { override: itemOverride(remove) },
					next: itemOverride(add),
					creditSystem: findFeatureById({
						features,
						featureId: add.feature_id ?? "",
						errorOnNotFound: false,
					}),
					features,
				}),
				onlyRateCardChanged:
					!!add.item &&
					!!remove?.item &&
					itemsEqualIgnoringFeatureOverride(add.item, remove.item),
			}),
		}),
	};
};
