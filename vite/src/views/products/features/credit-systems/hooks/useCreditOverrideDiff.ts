import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { creditSchemaItemsAreSame } from "@autumn/shared";
import { useMemo } from "react";

export type CreditOverrideRowStatus = "inherited" | "changed" | "added";

export type CreditOverrideDiff = {
	statusByIndex: CreditOverrideRowStatus[];
	missingFeatureIds: string[];
	changedCount: number;
	totalCount: number;
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
		const missingFeatureIds = [...catalog.keys()].filter(
			(featureId) => !overridden.has(featureId),
		);
		const changedRows = statusByIndex.filter(
			(status) => status !== "inherited",
		);

		return {
			statusByIndex,
			missingFeatureIds,
			changedCount: changedRows.length + missingFeatureIds.length,
			totalCount: new Set([...overridden, ...catalog.keys()]).size,
		};
	}, [schema, creditSystem]);
