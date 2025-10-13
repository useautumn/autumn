import {
	type AppEnv,
	CreateProductV2ParamsSchema,
	type FullProduct,
	type Organization,
	type ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";
import {
	constructProduct,
	initProductInStripe,
} from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getEntsWithFeature } from "../entitlements/entitlementUtils.js";

export const handleVersionProductV2 = async ({
	ctx,
	newProductV2,
	latestProduct,
	org,
	env,
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
			version: newVersion,
		}),
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

	// Handle new free trial
	if (newProductV2.free_trial || latestProduct.free_trial) {
		await handleNewFreeTrial({
			db,
			newFreeTrial: newProductV2.free_trial || null,
			curFreeTrial: latestProduct.free_trial,
			internalProductId: newProduct.internal_id,
			isCustom: false,
			newVersion: true, // This is a new product version
		});
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
