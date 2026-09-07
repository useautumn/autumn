import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { creditSchemaItemsAreSame } from "@autumn/shared";
import { useMemo } from "react";

export type CreditOverrideRowStatus = "inherited" | "changed" | "added";

export type CreditOverrideDiff = {
	/** Status per override row, index-aligned with the override schema. */
	statusByIndex: CreditOverrideRowStatus[];
	/** Catalog rows this override drops — the reason a plan can silently
	 * miss a feature the credit system was later given. */
	missingFeatureIds: string[];
	changedCount: number;
	catalogCount: number;
};

/**
 * How a plan item's override differs from the credit system it overrides.
 * Rows are matched by metered_feature_id because the schema is a keyed set,
 * not an ordered list — reordering is not a change.
 */
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
		const catalogByFeatureId = new Map(
			catalogSchema.map((item) => [item.metered_feature_id, item]),
		);

		const statusByIndex = schema.map((item): CreditOverrideRowStatus => {
			const catalogItem = catalogByFeatureId.get(item.metered_feature_id);
			if (!catalogItem) return "added";
			return creditSchemaItemsAreSame({ left: item, right: catalogItem })
				? "inherited"
				: "changed";
		});

		const overriddenFeatureIds = new Set(
			schema.map((item) => item.metered_feature_id),
		);

		return {
			statusByIndex,
			missingFeatureIds: catalogSchema
				.map((item) => item.metered_feature_id)
				.filter((featureId) => !overriddenFeatureIds.has(featureId)),
			changedCount: statusByIndex.filter((status) => status !== "inherited")
				.length,
			catalogCount: catalogSchema.length,
		};
	}, [schema, creditSystem]);
