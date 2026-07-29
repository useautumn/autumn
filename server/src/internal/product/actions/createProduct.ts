import type {
	CreateProductV2Params,
	Entitlement,
	FreeTrial,
	FullProduct,
	Price,
} from "@autumn/shared";
import {
	orgMultiCurrencyEnabled,
	ProductAlreadyExistsError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyPreparedPlanLicenseSync,
	preparePlanLicenseSync,
} from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { buildFullProductFromV2 } from "@/internal/products/productUtils/productV2Utils/buildFullProductFromV2.js";
import {
	constructProduct,
	initProductInStripe,
} from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { validateDefaultFlag } from "./validateDefaultFlag.js";

export const createProduct = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: CreateProductV2Params;
}) => {
	const { logger, org, features, env, db } = ctx;

	const existing = await ProductService.get({
		db,
		orgId: org.id,
		env,
		id: data.id,
	});

	// 1. If existing product, throw error
	if (existing) throw new ProductAlreadyExistsError({ productId: data.id });

	await validateDefaultFlag({
		ctx,
		body: data,
	});

	const product = constructProduct({
		productData: data,
		orgId: org.id,
		env,
		baseInternalProductId: data.base_internal_product_id,
	});
	const preparedLicenses = await preparePlanLicenseSync({
		ctx,
		parentProduct: buildFullProductFromV2({
			product: { ...product, items: data.items ?? [] },
			base: product,
			org,
			features,
		}),
		licenses: data.licenses,
	});
	await ProductService.insert({ db, product });

	const { items, free_trial } = data;

	let prices: Price[] = [];
	let entitlements: Entitlement[] = [];
	let updatedFeatures = features;
	if (items) {
		const res = await handleNewProductItems({
			db,
			product,
			features,
			curPrices: [],
			curEnts: [],
			newItems: items,
			logger,
			isCustom: false,
			newVersion: false,
			multiCurrencyEnabled: orgMultiCurrencyEnabled({ org }),
		});
		prices = res.prices;
		entitlements = res.entitlements;
		updatedFeatures = res.features;
	}

	await validateOneOffTrial({
		prices,
		freeTrial: free_trial || null,
	});

	let newFreeTrial: FreeTrial | null = null;
	if (free_trial) {
		newFreeTrial =
			(await handleNewFreeTrial({
				db,
				newFreeTrial: free_trial,
				curFreeTrial: null,
				internalProductId: product.internal_id,
				isCustom: false,
			})) || null;
	}

	const newFullProduct: FullProduct = {
		...product,
		prices,
		entitlements: getEntsWithFeature({
			ents: entitlements,
			features: updatedFeatures,
		}),
		free_trial: newFreeTrial,
	};

	if (preparedLicenses) {
		await applyPreparedPlanLicenseSync({
			ctx,
			prepared: preparedLicenses,
			parentInternalProductId: newFullProduct.internal_id,
		});
	}

	if (data.create_in_stripe !== false) {
		await initProductInStripe({
			ctx,
			product: newFullProduct,
		});
	}

	await addTaskToQueue({
		jobName: JobName.DetectBaseVariant,
		payload: {
			curProduct: newFullProduct,
		},
	});

	const productResponse = await getProductResponse({
		product: newFullProduct,
		features: updatedFeatures,
	});

	return productResponse;
};
