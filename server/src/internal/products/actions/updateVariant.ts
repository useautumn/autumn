import {
	apiPlan,
	type FullProduct,
	mapToProductV2,
	productsAreSame,
	type UpdateVariantParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { handleVersionVariantMinor } from "@/internal/products/handlers/handleVersionProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";

/** Fetch the latest variant, apply the update, persist (in-place or new minor version), return the latest variant. */
export const updateVariant = async ({
	ctx,
	planId,
	variantId,
	updates,
}: {
	ctx: AutumnContext;
	planId: string;
	variantId: string;
	updates: Omit<UpdateVariantParams, "plan_id" | "variant_id">;
}): Promise<FullProduct> => {
	const { db, env, org, features, logger } = ctx;

	const variant = await ProductService.getVariant({
		db,
		planId,
		variantId,
		orgId: org.id,
		env,
	});

	const curPrices = variant.prices;
	const curEnts = variant.entitlements;

	const mapped = apiPlan.map.paramsV1ToProductV2({
		ctx,
		currentFullProduct: variant,
		params: updates,
	});

	const curItems = mapToProductItems({
		prices: curPrices,
		entitlements: curEnts,
		features,
	});

	const newItems = mapped.items ?? curItems;
	const nextVariantProduct = {
		...mapToProductV2({
			product: variant,
			features,
		}),
		...mapped,
		items: newItems,
	};

	const hasCustomers = await CusProductService.getByInternalProductId({
		db,
		internalProductId: variant.internal_id,
		limit: 1,
	});

	const { itemsSame } = productsAreSame({
		newProductV2: nextVariantProduct,
		curProductV1: variant,
		features,
	});

	// Customers exist and items changed → create a new minor version
	if (hasCustomers.length > 0 && !itemsSame) {
		await handleVersionVariantMinor({
			ctx,
			newProductV2: nextVariantProduct,
			latestVariant: variant,
		});

		return ProductService.getVariant({
			db,
			planId,
			variantId,
			orgId: org.id,
			env,
		});
	}

	// No customers (or items unchanged) → update in place
	await handleNewProductItems({
		db,
		curPrices,
		curEnts,
		newItems,
		features,
		product: variant,
		logger,
		isCustom: false,
	});

	return ProductService.getVariant({
		db,
		planId,
		variantId,
		orgId: org.id,
		env,
	});
};
