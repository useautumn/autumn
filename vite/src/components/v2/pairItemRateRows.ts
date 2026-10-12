import type { RateChange } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";

export type ItemRateRow = {
	addIndex: number;
	removeIndex: number | undefined;
	changes: RateChange[];
	/** The add and its paired remove are one item whose rate card alone changed. */
	updated: boolean;
};

export type ItemRateRows = {
	rows: ItemRateRow[];
	mergedRemoveIndices: Set<number>;
};

type FeatureKeyed = { feature_id?: string | null };

/** Pairs each add with the remove of the same feature; a pair that differs only in its rate card becomes one updated row. */
export const pairItemRateRows = <
	A extends FeatureKeyed,
	R extends FeatureKeyed,
>({
	adds,
	removes,
	compare,
}: {
	adds: A[];
	removes: R[];
	compare: (pair: { add: A; remove: R | undefined }) => {
		changes: RateChange[];
		onlyRateCardChanged: boolean;
	};
}): ItemRateRows => {
	const rows = adds.map((add, addIndex) => {
		const found = removes.findIndex(
			(remove) => remove.feature_id === add.feature_id,
		);
		const removeIndex = found === -1 ? undefined : found;
		const remove = removeIndex === undefined ? undefined : removes[removeIndex];
		const { changes, onlyRateCardChanged } = compare({ add, remove });
		return {
			addIndex,
			removeIndex,
			changes,
			updated: !!remove && onlyRateCardChanged && changes.length > 0,
		};
	});
	return {
		rows,
		mergedRemoveIndices: new Set(
			rows.flatMap((row) =>
				row.updated && row.removeIndex !== undefined ? [row.removeIndex] : [],
			),
		),
	};
};
