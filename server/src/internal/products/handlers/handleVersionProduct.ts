import {
	type AppEnv,
	CreateProductV2ParamsSchema,
	type FullProduct,
	type Organization,
	type ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv.js";
import { EntitlementService } from "@server/internal/products/entitlements/EntitlementService.js";
import { getEntsWithFeature } from "@server/internal/products/entitlements/entitlementUtils.js";
import { handleNewFreeTrial } from "@server/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@server/internal/products/ProductService.js";
import { PriceService } from "@server/internal/products/prices/PriceService.js";
import { handleNewProductItems } from "@server/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { validateProductItems } from "@server/internal/products/product-items/validateProductItems.js";
import {
	constructProduct,
	initProductInStripe,
} from "@server/internal/products/productUtils.js";
import { JobName } from "@server/queue/JobName.js";
import { addTaskToQueue } from "@server/queue/queueUtils.js";

export const handleVersionProductV2 = async ({
	ctx,
	newProductV2,
	latestProduct,
	org,
	env,
	skipStripeInit = false,
	// items,
	// freeTrial,
}: {
	ctx: AutumnContext;
	newProductV2: ProductV2;
	latestProduct: FullProduct;
	org: Organization;
	env: AppEnv;
	// items: ProductItem[];
	// freeTrial: FreeTrial;
	skipStripeInit?: boolean;
}) => {
	const { db, features } = ctx;

	const curVersion = latestProduct.version;
	const newVersion = curVersion + 1;

	console.log(
		`Updating product ${latestProduct.id} version from ${curVersion} to ${newVersion}`,
	);

	const newProduct = constructProduct({
		productData: CreateProductV2ParamsSchema.parse({
			...latestProduct,
			...newProductV2,
		}),
		version: newVersion,
		orgId: org.id,
		env: latestProduct.env as AppEnv,
		processor: latestProduct.processor || undefined,
	});

	// Validate product items...
	validateProductItems({
		newItems: newProductV2.items,
		features,
		orgId: org.id,
		env,
	});

	if (latestProduct.is_default) {
		await ProductService.updateByInternalId({
			db,
			internalId: latestProduct.internal_id,
			update: {
				is_default: false,
			},
		});
	}

	await ProductService.insert({ db, product: newProduct });

	const { customPrices, customEnts } = await handleNewProductItems({
		db,
		curPrices: latestProduct.prices,
		curEnts: latestProduct.entitlements,
		newItems: newProductV2.items,
		features,
		product: newProduct,
		logger: console,
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

	await initProductInStripe({
		db,
		product: {
			...newProduct,
			prices: customPrices,
			entitlements: getEntsWithFeature({ ents: customEnts, features }),
		} as FullProduct,
		org,
		env,
		logger: console,
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
