import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	isAiCreditSystem,
} from "@autumn/shared";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { withRate } from "../utils/creditOverrideSchema";
import { createSchemaItem } from "../utils/creditSchemaUtils";
import { rateCardRows } from "../utils/rateCardRows";
import { useFeatureOverride } from "./useFeatureOverride";

/** The row open for inline editing; `featureId` is null while adding a feature. */
export type RateCardEdit = {
	featureId: string | null;
	draft: CreditSchemaItem;
};

/** A plan item's rate card: its rows, the one row being edited, and the edits it can make. */
export function useRateCardEditor() {
	const { creditSystem, override, schema, setSchema, clear } =
		useFeatureOverride();
	const { features } = useFeaturesQuery();
	const [edit, setEdit] = useState<RateCardEdit | null>(null);

	const summary = rateCardRows({
		override: override?.schema ?? [],
		creditSystem,
	});
	const listedFeatureIds = new Set(summary.rows.map((row) => row.featureId));
	const addableFeatures = features.filter(
		(feature: Feature) =>
			(feature.type === FeatureType.Metered ||
				isAiCreditSystem(feature.type)) &&
			!listedFeatureIds.has(feature.id),
	);

	const putRate = (rate: CreditSchemaItem) =>
		setSchema(withRate({ schema, rate }));

	return {
		creditSystem,
		features,
		summary,
		edit,
		addableFeatures,
		startEdit: (rate: CreditSchemaItem) =>
			setEdit({ featureId: rate.metered_feature_id, draft: rate }),
		startAdd: () => setEdit({ featureId: null, draft: createSchemaItem() }),
		setDraft: (draft: CreditSchemaItem) =>
			setEdit((current) => current && { ...current, draft }),
		cancel: () => setEdit(null),
		commit: () => {
			if (edit?.draft.metered_feature_id) putRate(edit.draft);
			setEdit(null);
		},
		remove: (featureId: string) => {
			setSchema(schema.filter((rate) => rate.metered_feature_id !== featureId));
			setEdit(null);
		},
		/** Reset and Restore both put the credit system's own rate back. */
		restoreCatalogRate: putRate,
		resetAll: () => {
			clear();
			setEdit(null);
		},
	};
}

export type RateCardEditor = ReturnType<typeof useRateCardEditor>;
