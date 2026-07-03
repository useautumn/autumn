import {
	type AppEnv,
	CreateProductV2ParamsSchema,
	type FullProduct,
	type Organization,
	products,
	type ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv.js";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { EntitlementService } from "@server/internal/products/entitlements/EntitlementService.js";
import { getEntsWithFeature } from "@server/internal/products/entitlements/entitlementUtils.js";
import { handleNewFreeTrial } from "@server/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@server/internal/products/ProductService.js";
import { PriceService } from "@server/internal/products/prices/PriceService.js";
import { handleNewProductItems } from "@server/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { validateProductItems } from "@server/internal/products/product-items/validateProductItems.js";
import {
	constructProduct,
} from "@server/internal/products/productUtils.js";
import { JobName } from "@server/queue/JobName.js";
import { addTaskToQueue } from "@server/queue/queueUtils.js";
import { and, eq, ne } from "drizzle-orm";

const clearDefaultFlagFromOtherVersions = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: { id: string; internal_id: string };
}) => {
	await ctx.db
		.update(products)
		.set({ is_default: false })
		.where(
			and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				eq(products.id, product.id),
				ne(products.internal_id, product.internal_id),
				eq(products.is_default, true),
			),
		);
};

export const handleVersionProductV2 = async ({
	ctx,
	newProductV2,
	latestProduct,
	org,
	env,
	skipStripeInit = false,
	baseInternalProductId,
}: {
	ctx: AutumnContext;
	newProductV2: ProductV2;
	latestProduct: FullProduct;
	org: Organization;
	env: AppEnv;
	skipStripeInit?: boolean;
	baseInternalProductId?: string | null;
}) => {
	const { db, features } = ctx;

	const latestForVersioning = await ProductService.getFull({
		db,
		idOrInternalId: latestProduct.id,
		orgId: org.id,
		env,
	});
	const curVersion = latestForVersioning.version;
	const newVersion = curVersion + 1;

	console.log(
		`Updating product ${latestProduct.id} version from ${curVersion} to ${newVersion}`,
	);

	// Deep-merge `config` so partial patches (e.g. `{ config: { ignore_past_due: true } }`)
	// don't clobber other fields that might be added to ProductConfig later.
	// Mirrors the same merge semantics used in the non-versioning update path
	// (see updateProductDetails.ts). With only one field today this is a
	// no-op in practice; the guard is here so that future fields in
	// ProductConfig survive partial-update versioning without silent drops.
	const mergedConfig =
		newProductV2.config !== undefined
			? { ...latestProduct.config, ...newProductV2.config }
			: latestProduct.config;

	const effectiveBaseInternalProductId =
		baseInternalProductId !== undefined
			? baseInternalProductId
			: (latestProduct.base_internal_product_id ?? null);

	const newProduct = constructProduct({
		productData: CreateProductV2ParamsSchema.parse({
			...latestProduct,
			...newProductV2,
			config: mergedConfig,
		}),
		version: newVersion,
		orgId: org.id,
		env: latestProduct.env as AppEnv,
		processor: latestProduct.processor || undefined,
		baseInternalProductId: effectiveBaseInternalProductId,
	});

	// Validate product items...
	validateProductItems({
		newItems: newProductV2.items,
		features,
		orgId: org.id,
		env,
	});

	await ProductService.insert({ db, product: newProduct });

	await clearDefaultFlagFromOtherVersions({
		ctx,
		product: newProduct,
	});

	const { customPrices, customEnts } = await handleNewProductItems({
		db,
		curPrices: latestProduct.prices,
		curEnts: latestProduct.entitlements,
		newItems: newProductV2.items,
		features,
		product: newProduct,
		logger: ctx.logger,
		isCustom: false,
		newVersion: true,
	});

	await EntitlementService.insert({
		db,
		data: customEnts,
	});

	await PriceService.insert({
		db,
		data: customPrices,
	});

	// Handle new free trial (create new)
	// newProductV2.free_trial can be:
	// - undefined: not changed, use latestProduct.free_trial
	// - null: explicitly unset (no free trial for new version)
	// - FreeTrial object: set to that value
	const freeTrialForNewVersion =
		newProductV2.free_trial !== undefined // if the new ft is not undefined
			? (newProductV2.free_trial ?? null) // use the new free trial value, or null to unset
			: (latestProduct.free_trial ?? null); // use the latest product's free trial, or null to keep unset

	await handleNewFreeTrial({
		db,
		newFreeTrial: freeTrialForNewVersion,
		curFreeTrial: null,
		internalProductId: newProduct.internal_id,
		isCustom: false,
		newVersion: true, // This is a new product version
	});

	if (skipStripeInit) {
		return newProduct;
	}

	await initStripeResourcesForProducts({
		ctx,
		products: [{
			...newProduct,
			prices: customPrices,
			entitlements: getEntsWithFeature({ ents: customEnts, features }),
		} as FullProduct],
	});

	await addTaskToQueue({
		jobName: JobName.RewardMigration,
		payload: {
			oldPrices: latestProduct.prices,
			productId: latestProduct.id,
			orgId: org.id,
			env,
		},
	});

	return newProduct;
};
