import type {
	CreateProductV2Params,
	Entitlement,
	FreeTrial,
	FullProduct,
	Price,
} from "@autumn/shared";
import { ProductAlreadyExistsError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { constructProduct, initProductInStripe } from "@/internal/products/productUtils.js";
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

	// 1. If existing non-archived product, throw error
	if (existing && !existing.archived) throw new ProductAlreadyExistsError({ productId: data.id });

	await validateDefaultFlag({
		ctx,
		body: data,
	});

	const product = await ProductService.insert({
		db,
		product: constructProduct({
			productData: data,
			orgId: org.id,
			env,
		}),
	});

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

	await initProductInStripe({
		ctx,
		product: newFullProduct,
	});

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
