export interface PrepaidOptionItem {
	feature_id?: string | null;
	feature?: (Record<string, unknown> & { internal_id?: string | null }) | null;
}

export const getPrepaidOptionQuantity = ({
	item,
	prepaidOptions,
}: {
	item: PrepaidOptionItem;
	prepaidOptions: Record<string, number>;
}) => {
	if (item.feature_id && prepaidOptions[item.feature_id] !== undefined) {
		return prepaidOptions[item.feature_id];
	}

	const internalFeatureId = item.feature?.internal_id;
	if (internalFeatureId && prepaidOptions[internalFeatureId] !== undefined) {
		return prepaidOptions[internalFeatureId];
	}

	return undefined;
};

export const mergePrepaidOptionsByFeatureIdentity = ({
	currentItems,
	currentPrepaidOptions,
	nextItems,
}: {
	currentItems: PrepaidOptionItem[];
	currentPrepaidOptions: Record<string, number>;
	nextItems: PrepaidOptionItem[];
}) => {
	const nextPrepaidOptions = { ...currentPrepaidOptions };
	const quantityByIdentity = new Map<string, number>();

	for (const item of currentItems) {
		const quantity = getPrepaidOptionQuantity({
			item,
			prepaidOptions: currentPrepaidOptions,
		});

		if (quantity === undefined) continue;
		if (item.feature_id) {
			quantityByIdentity.set(item.feature_id, quantity);
		}
		if (item.feature?.internal_id) {
			quantityByIdentity.set(item.feature.internal_id, quantity);
		}
	}

	let didChange = false;

	for (const item of nextItems) {
		const nextFeatureId = item.feature_id ?? item.feature?.internal_id;
		if (!nextFeatureId) continue;

		const matchedQuantity =
			quantityByIdentity.get(nextFeatureId) ??
			(item.feature?.internal_id
				? quantityByIdentity.get(item.feature.internal_id)
				: undefined);
		const nextQuantity = matchedQuantity ?? 0;

		if (nextPrepaidOptions[nextFeatureId] !== nextQuantity) {
			nextPrepaidOptions[nextFeatureId] = nextQuantity;
			didChange = true;
		}
	}

	return { nextPrepaidOptions, didChange };
};
