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

/** The remove an add replaces: the only one of its feature, else the one on the same cadence. */
const pairedRemoveIndex = <A extends FeatureKeyed, R extends FeatureKeyed>({
	add,
	removes,
	taken,
	sameCadence,
}: {
	add: A;
	removes: R[];
	taken: Set<number>;
	sameCadence: (pair: { add: A; remove: R }) => boolean;
}): number | undefined => {
	const candidates = removes.flatMap((remove, index) =>
		remove.feature_id === add.feature_id && !taken.has(index) ? [index] : [],
	);
	if (candidates.length === 1) return candidates[0];
	return candidates.find((index) =>
		sameCadence({ add, remove: removes[index] }),
	);
};

/** The remove index each add replaces, by position; a remove pairs with at most one add. */
export const pairRemoveIndices = <
	A extends FeatureKeyed,
	R extends FeatureKeyed,
>({
	adds,
	removes,
	sameCadence,
}: {
	adds: A[];
	removes: R[];
	sameCadence: (pair: { add: A; remove: R }) => boolean;
}): (number | undefined)[] => {
	const taken = new Set<number>();
	return adds.map((add) => {
		const removeIndex = pairedRemoveIndex({ add, removes, taken, sameCadence });
		if (removeIndex !== undefined) taken.add(removeIndex);
		return removeIndex;
	});
};

/** Pairs each add with the remove it replaces; a pair that differs only in its rate card becomes one updated row. */
export const pairItemRateRows = <
	A extends FeatureKeyed,
	R extends FeatureKeyed,
>({
	adds,
	removes,
	sameCadence,
	compare,
}: {
	adds: A[];
	removes: R[];
	sameCadence: (pair: { add: A; remove: R }) => boolean;
	compare: (pair: { add: A; remove: R | undefined }) => {
		changes: RateChange[];
		onlyRateCardChanged: boolean;
	};
}): ItemRateRows => {
	const removeIndices = pairRemoveIndices({ adds, removes, sameCadence });
	const rows = adds.map((add, addIndex) => {
		const removeIndex = removeIndices[addIndex];
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
