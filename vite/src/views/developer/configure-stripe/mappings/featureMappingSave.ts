import type { CatalogUpdateMappingsParamsInput } from "@autumn/shared";
import type { CatalogMappingsSave } from "@/hooks/queries/catalog/useCatalogMappings";
import {
	type PriceMappingRow,
	rowUsesAnotherProduct,
} from "./priceMappingRows";
import { CREATE_STRIPE_PRODUCT } from "./StripeProductSelect";

/** A touched row; `product_id: null` means it follows the default product. */
export type FeatureRowChoice = {
	product_id: string | null;
	price_id: string | null;
};

export type FeatureSheetValues = {
	default_product_id: string | null;
	rows: Record<string, FeatureRowChoice>;
};

/** What the row's product picker shows: `null` renders as "Default". */
export const rowProductChoice = ({
	row,
	values,
	initialDefaultId,
}: {
	row: PriceMappingRow;
	values: FeatureSheetValues;
	initialDefaultId: string | null;
}) => {
	const touched = values.rows[row.priceId];
	if (touched) return touched.product_id;
	return rowUsesAnotherProduct({
		row,
		defaultStripeProductId: initialDefaultId,
	})
		? row.stripeProductId
		: null;
};

export const rowEffectiveProductId = ({
	row,
	values,
	initialDefaultId,
}: {
	row: PriceMappingRow;
	values: FeatureSheetValues;
	initialDefaultId: string | null;
}) =>
	rowProductChoice({ row, values, initialDefaultId }) ??
	values.default_product_id;

/** A price keeps showing its Stripe price until the user moves its row to another product. */
export const rowPriceChoice = ({
	row,
	values,
	initialDefaultId,
}: {
	row: PriceMappingRow;
	values: FeatureSheetValues;
	initialDefaultId: string | null;
}) => {
	const touched = values.rows[row.priceId];
	if (touched) return touched.price_id;
	const productChanged =
		rowEffectiveProductId({ row, values, initialDefaultId }) !==
		rowEffectiveProductId({
			row,
			values: { default_product_id: initialDefaultId, rows: {} },
			initialDefaultId,
		});
	return productChanged ? null : row.stripePriceId;
};

export const countRowsOnOtherProducts = ({
	rows,
	values,
	initialDefaultId,
}: {
	rows: PriceMappingRow[];
	values: FeatureSheetValues;
	initialDefaultId: string | null;
}) =>
	rows.filter(
		(row) => rowProductChoice({ row, values, initialDefaultId }) !== null,
	).length;

type PriceMappingInput = NonNullable<
	CatalogUpdateMappingsParamsInput["price_mappings"]
>[number];

export const buildFeatureSheetSave = ({
	featureId,
	values,
	initialDefaultId,
	rows,
}: {
	featureId: string;
	values: FeatureSheetValues;
	initialDefaultId: string | null;
	rows: PriceMappingRow[];
}): CatalogMappingsSave => {
	const priceMappings = rows.flatMap((row): PriceMappingInput[] => {
		const choice = values.rows[row.priceId];
		if (!choice) return [];
		if (choice.product_id === CREATE_STRIPE_PRODUCT) {
			return [
				{
					price_id: row.priceId,
					stripe_product_id: null,
					create_stripe_product: true,
				},
			];
		}
		const productId = rowEffectiveProductId({ row, values, initialDefaultId });
		// A price with no product bills under the feature's default, including a new or empty one.
		if (!productId || productId === CREATE_STRIPE_PRODUCT) {
			return [{ price_id: row.priceId, stripe_product_id: null }];
		}
		return [
			{
				price_id: row.priceId,
				stripe_product_id: productId,
				stripe_price_id: values.rows[row.priceId].price_id,
			},
		];
	});

	return {
		mappings: {
			feature_mappings:
				values.default_product_id !== initialDefaultId
					? [
							{
								feature_id: featureId,
								...(values.default_product_id === CREATE_STRIPE_PRODUCT
									? { stripe_product_id: null, create_stripe_product: true }
									: { stripe_product_id: values.default_product_id }),
							},
						]
					: [],
			price_mappings: priceMappings,
		},
	};
};

/** Rows whose Stripe resources change, for the scoped-rewards warning. */
export const affectedFeaturePriceIds = ({
	rows,
	values,
	initialDefaultId,
}: {
	rows: PriceMappingRow[];
	values: FeatureSheetValues;
	initialDefaultId: string | null;
}) =>
	rows
		.filter(
			(row) =>
				Boolean(values.rows[row.priceId]) ||
				rowEffectiveProductId({ row, values, initialDefaultId }) !==
					rowEffectiveProductId({
						row,
						values: { default_product_id: initialDefaultId, rows: {} },
						initialDefaultId,
					}),
		)
		.map((row) => row.priceId);
