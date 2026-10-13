import {
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	creditSchemaItemsAreSame,
	entitlementToCreditSystem,
	type Feature,
} from "@autumn/shared";

/** The rate card customers on the plan get: catalog rows merged with the override. */
export const overrideToEffectiveSchema = ({
	override,
	creditSystem,
}: {
	override: CreditSchemaOverrideItem[];
	creditSystem?: Feature;
}): CreditSchemaItem[] => {
	if (!creditSystem) return [];
	return entitlementToCreditSystem({
		entitlement: {
			feature: creditSystem,
			feature_override: { schema: override },
		},
	}).config.schema;
};

/** Stores only what differs: edited and added rows, plus removed catalog rows as excluded. */
export const effectiveSchemaToOverride = ({
	schema,
	catalog: catalogSchema,
}: {
	schema: CreditSchemaItem[];
	catalog: CreditSchemaItem[];
}): CreditSchemaOverrideItem[] => {
	const catalog = new Map(
		catalogSchema.map((item) => [item.metered_feature_id, item]),
	);
	const listed = new Set(schema.map((item) => item.metered_feature_id));

	const differingRows = schema.filter((item) => {
		const catalogItem = catalog.get(item.metered_feature_id);
		return !(
			catalogItem &&
			creditSchemaItemsAreSame({ left: item, right: catalogItem })
		);
	});
	const excludedRows = catalogSchema
		.filter((item) => !listed.has(item.metered_feature_id))
		.map((item) => ({
			metered_feature_id: item.metered_feature_id,
			excluded: true as const,
		}));

	return [...differingRows, ...excludedRows];
};

/** Puts a catalog row back in place of the plan's edited or removed one. */
export const restoreCatalogRate = ({
	schema,
	catalogRate,
}: {
	schema: CreditSchemaItem[];
	catalogRate: CreditSchemaItem;
}): CreditSchemaItem[] => [
	...schema.filter(
		(item) => item.metered_feature_id !== catalogRate.metered_feature_id,
	),
	catalogRate,
];
