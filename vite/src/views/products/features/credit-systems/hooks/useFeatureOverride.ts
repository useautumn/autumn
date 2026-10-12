import type {
	CreditSchemaItem,
	Feature,
	FeatureConfigOverride,
	FeatureMarkupsOverride,
} from "@autumn/shared";
import { isAiCreditSystem, isExcludedCreditSchemaItem } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export const useFeatureOverride = () => {
	const { item, setItem } = useProductItemContext();
	const { features } = useFeaturesQuery();

	const creditSystem = features.find(
		(feature: Feature) => feature.id === item?.feature_id,
	);
	const override: FeatureConfigOverride | undefined =
		item?.config?.feature_override;

	const setOverride = (next: FeatureConfigOverride | null) => {
		if (!item) return;
		const config = { ...(item.config ?? {}) };
		if (next === null) {
			delete config.feature_override;
		} else {
			config.feature_override = next;
		}
		setItem({ ...item, config });
	};

	const overrideRows = override?.schema ?? [];
	const excludedRows = overrideRows.filter(isExcludedCreditSchemaItem);
	const rateRows = overrideRows.filter(
		(row): row is CreditSchemaItem => !isExcludedCreditSchemaItem(row),
	);

	return {
		item,
		creditSystem,
		override,
		isAi: isAiCreditSystem(creditSystem?.type),
		hasOverride: override != null,
		schema: rateRows,
		markups: override?.markups,

		setSchema: (schema: CreditSchemaItem[] | null) =>
			setOverride(
				schema === null ? null : { schema: [...schema, ...excludedRows] },
			),
		setMarkups: (markups: FeatureMarkupsOverride | null) =>
			setOverride(markups === null ? null : { markups }),

		seedSchema: () =>
			setOverride({
				schema: structuredClone(creditSystem?.config?.schema ?? []),
			}),
		seedMarkups: () =>
			setOverride({
				markups: {
					default_markup: creditSystem?.config?.default_markup ?? 0,
					provider_markups: structuredClone(
						creditSystem?.config?.provider_markups ?? {},
					),
					model_markups: structuredClone(creditSystem?.model_markups ?? {}),
				},
			}),
		clear: () => setOverride(null),
	};
};
