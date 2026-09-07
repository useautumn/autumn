import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { creditSchemaItemsAreSame } from "@autumn/shared";
import { useMemo } from "react";

export type CreditOverrideRowStatus = "inherited" | "changed" | "added";

export type CreditOverrideDiff = {
	statusByIndex: CreditOverrideRowStatus[];
	missingFeatureIds: string[];
	changedCount: number;
	catalogCount: number;
};

const toMeteredFeatureIds = (schema: CreditSchemaItem[]) =>
	schema.map((item) => item.metered_feature_id);

const classifyRow = ({
	item,
	catalog,
}: {
	item: CreditSchemaItem;
	catalog: Map<string, CreditSchemaItem>;
}): CreditOverrideRowStatus => {
	const catalogItem = catalog.get(item.metered_feature_id);
	if (!catalogItem) return "added";
	return creditSchemaItemsAreSame({ left: item, right: catalogItem })
		? "inherited"
		: "changed";
};

/** Rows match by metered_feature_id — the schema is a keyed set, so reordering
 * is not a change. */
export const useCreditOverrideDiff = ({
	schema,
	creditSystem,
}: {
	schema: CreditSchemaItem[];
	creditSystem?: Feature;
}): CreditOverrideDiff =>
	useMemo(() => {
		const catalogSchema: CreditSchemaItem[] =
			creditSystem?.config?.schema ?? [];
		const catalog = new Map(
			catalogSchema.map((item) => [item.metered_feature_id, item]),
		);
		const overridden = new Set(toMeteredFeatureIds(schema));
		const statusByIndex = schema.map((item) => classifyRow({ item, catalog }));

		return {
			statusByIndex,
			missingFeatureIds: toMeteredFeatureIds(catalogSchema).filter(
				(featureId) => !overridden.has(featureId),
			),
			changedCount: statusByIndex.filter((status) => status !== "inherited")
				.length,
			catalogCount: catalogSchema.length,
		};
	}, [schema, creditSystem]);
