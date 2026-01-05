import {
	AffectedResource,
	type ApiPlan,
	ApiVersion,
	applyResponseVersionChanges,
	CreatePlanParamsSchema,
	type CreateProductV2Params,
	CreateProductV2ParamsSchema,
	type Entitlement,
	type FreeTrial,
	type FullProduct,
	type Price,
	ProductAlreadyExistsError,
	planToProductV2,
} from "@autumn/shared";

import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getEntsWithFeature } from "../entitlements/entitlementUtils.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "../free-trials/freeTrialUtils.js";
import { ProductService } from "../ProductService.js";
import { handleNewProductItems } from "../product-items/productItemUtils/handleNewProductItems.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";
import { constructProduct, initProductInStripe } from "../productUtils.js";
import { validateDefaultFlag } from "./productActions/validateDefaultFlag.js";

/**
 * Route: POST /products - Create a product
 */
export const handleCreatePlan = createRoute({
	// body: CreateProductV2ParamsSchema,
	versionedBody: {
		latest: CreatePlanParamsSchema,
		[ApiVersion.V1_Beta]: CreateProductV2ParamsSchema,
	},
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const v1_2Body = (
			ctx.apiVersion.gte(ApiVersion.V2_0)
				? planToProductV2({ plan: body, features: ctx.features })
				: body
		) as CreateProductV2Params;

		const { logger, org, features, env, db } = ctx;

		const existing = await ProductService.get({
			db,
			orgId: org.id,
			env,
			id: body.id,
		});

		// 1. If existing product, throw error
		if (existing) throw new ProductAlreadyExistsError({ productId: body.id });

		await validateDefaultFlag({
			ctx,
			body: v1_2Body,
		});

		const backendProduct = constructProduct({
			productData: v1_2Body as CreateProductV2Params,
			orgId: org.id,
			env,
		});

		const product = await ProductService.insert({
			db,
			product: backendProduct,
		});

		const { items, free_trial } = v1_2Body;

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
			description: body?.description ?? null,
			prices,
			entitlements: getEntsWithFeature({ ents: entitlements, features: updatedFeatures }),
			free_trial: newFreeTrial,
		};

		await initProductInStripe({
			db,
			product: newFullProduct,
			org,
			env,
			logger,
		});

		await addTaskToQueue({
			jobName: JobName.DetectBaseVariant,
			payload: {
				curProduct: newFullProduct,
			},
		});

		const planResponse = await getPlanResponse({
			product: newFullProduct,
			features: updatedFeatures,
		});

		// Apply version transformations for client
		const versionedResponse = applyResponseVersionChanges<ApiPlan>({
			input: planResponse,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Product,
			legacyData: {
				features: ctx.features,
			},
			ctx,
		});

		return c.json(versionedResponse);
	},
});
