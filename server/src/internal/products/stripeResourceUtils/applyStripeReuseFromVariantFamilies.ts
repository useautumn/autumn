import {
	type FullProduct,
	hasMissingStripeResourcesForProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyStripeResourceReuseForProduct } from "./applyStripeResourceReuseForProduct.js";
import { listStripeReuseFamilyProducts } from "./listStripeReuseFamilyProducts.js";

const getMissingVariantBaseInternalIds = ({
	products,
}: {
	products: FullProduct[];
}) => [
	...new Set(
		products
			.filter(
				(product) =>
					product.base_internal_product_id &&
					hasMissingStripeResourcesForProduct({ product }),
			)
			.map((product) => product.base_internal_product_id!),
	),
];

const listStripeReuseFamilyProductsByBaseInternalId = async ({
	ctx,
	baseInternalProductIds,
}: {
	ctx: AutumnContext;
	baseInternalProductIds: string[];
}) => {
	if (baseInternalProductIds.length === 0) return new Map<string, FullProduct[]>();

	const familyProducts = await listStripeReuseFamilyProducts({
		ctx,
		baseInternalProductIds,
	});
	const familyProductsByBaseInternalId = new Map<string, FullProduct[]>();

	for (const row of familyProducts) {
		const products =
			familyProductsByBaseInternalId.get(row.baseInternalProductId) ?? [];
		products.push(row.product);
		familyProductsByBaseInternalId.set(row.baseInternalProductId, products);
	}

	return familyProductsByBaseInternalId;
};

export const applyStripeReuseFromVariantFamilies = async ({
	ctx,
	products,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
}) => {
	const baseInternalProductIds = getMissingVariantBaseInternalIds({ products });
	if (baseInternalProductIds.length === 0) return;

	const familyProductsByBaseInternalId =
		await listStripeReuseFamilyProductsByBaseInternalId({
			ctx,
			baseInternalProductIds,
		});
	if (familyProductsByBaseInternalId.size === 0) return;

	await Promise.all(
		products.map((product) => {
			if (
				!product.base_internal_product_id ||
				!hasMissingStripeResourcesForProduct({ product })
			) {
				return Promise.resolve();
			}

			const candidateProducts =
				familyProductsByBaseInternalId.get(
					product.base_internal_product_id,
				) ?? [];
			return applyStripeResourceReuseForProduct({
				ctx,
				product,
				candidateProducts: candidateProducts.filter(
					(candidate) => candidate.internal_id !== product.internal_id,
				),
			});
		}),
	);
};
