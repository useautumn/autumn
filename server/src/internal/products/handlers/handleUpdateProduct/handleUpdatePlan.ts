import {
	AffectedResource,
	type ApiPlan,
	ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	type FreeTrial,
	mapToProductV2,
	notNullish,
	ProductNotFoundError,
	type ProductV2,
	planToProductV2,
	productsAreSame,
	RecaseError,
	UpdatePlanParamsSchema,
	UpdatePlanQuerySchema,
	UpdateProductQuerySchema,
	UpdateProductSchema,
	type UpdateProductV2Params,
	UpdateProductV2ParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "../../free-trials/freeTrialUtils.js";
import { ProductService } from "../../ProductService.js";
import { handleNewProductItems } from "../../product-items/productItemUtils/handleNewProductItems.js";
import { invalidateProductsCache } from "../../productCacheUtils.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";
import { initProductInStripe } from "../../productUtils.js";
import { handleVersionProductV2 } from "../handleVersionProduct.js";
import { validateDefaultFlag } from "../productActions/validateDefaultFlag.js";
import { handleUpdateProductDetails } from "./updateProductDetails.js";

export const handleUpdatePlan = createRoute({
	versionedBody: {
		latest: UpdatePlanParamsSchema,
		[ApiVersion.V1_Beta]: UpdateProductV2ParamsSchema,
	},
	versionedQuery: {
		latest: UpdatePlanQuerySchema,
		[ApiVersion.V1_Beta]: UpdateProductQuerySchema,
	},
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const productId = c.req.param("product_id");

		const { db, org, env, features, logger } = ctx;
		const query = c.req.valid("query") || {};
		const { version, upsert, disable_version } = query;

		// Convert to ProductV2 format only if client sent V2 Plan format
		// V1.2 clients already send ProductV2, no conversion needed

		const v1_2Body = ctx.apiVersion.gte(new ApiVersionClass(ApiVersion.V2_0))
			? planToProductV2({ plan: body as ApiPlan, features: ctx.features })
			: (body as UpdateProductV2Params);

		const [fullProduct, rewardPrograms, _defaultProds] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
				version: version ? version : undefined,
				allowNotFound: upsert === true,
			}),
			RewardProgramService.getByProductId({
				db,
				productIds: [productId],
				orgId: org.id,
				env,
			}),
			ProductService.listDefault({
				db,
				orgId: org.id,
				env,
			}),
		]);

		if (!fullProduct) throw new ProductNotFoundError({ productId: productId });

		const cusProductsCurVersion =
			await CusProductService.getByInternalProductId({
				db,
				internalProductId: fullProduct.internal_id,
			});

		const curProductV2 = mapToProductV2({
			product: fullProduct,
			features,
		});

		// Handle free_trial: distinguish between not provided, null (unset), and value (set)
		const freeTrialExplicitlyProvided = "free_trial" in v1_2Body;
		const newFreeTrial = freeTrialExplicitlyProvided
			? ((v1_2Body.free_trial as FreeTrial | null | undefined) ?? null)
			: (curProductV2.free_trial ?? undefined);
		const newProductV2: ProductV2 = {
			...curProductV2,
			...v1_2Body,
			group: v1_2Body.group || curProductV2.group || "",
			items: v1_2Body.items || [],
			free_trial: newFreeTrial,
		};

		await validateDefaultFlag({
			ctx,
			body: v1_2Body,
			curProduct: fullProduct,
		});

		await handleUpdateProductDetails({
			db,
			curProduct: fullProduct,
			newProduct: UpdateProductSchema.parse(v1_2Body),
			newFreeTrial,
			items: v1_2Body.items || curProductV2.items,
			org,
			rewardPrograms,
			logger: ctx.logger,
		});

		const itemsExist = notNullish(v1_2Body.items);

		const cusProductExists = cusProductsCurVersion.length > 0;

		// Check if versioning is needed (customers exist AND items or free trial changed)
		const freeTrialProvided = "free_trial" in body;
		if (cusProductExists && (itemsExist || freeTrialProvided)) {
			if (disable_version) {
				throw new RecaseError({
					message: "Cannot auto save product as there are existing customers",
				});
			}

			const { itemsSame, freeTrialsSame } = productsAreSame({
				newProductV2: newProductV2,
				curProductV1: fullProduct,
				curProductV2: curProductV2,
				features,
			});

			const productSame = itemsSame && freeTrialsSame;

			if (!productSame) {
				const newProduct = await handleVersionProductV2({
					ctx,
					newProductV2: newProductV2,
					latestProduct: fullProduct,
					org,
					env,
				});

				await invalidateProductsCache({ orgId: org.id, env });

				return c.json(newProduct);
			}

			return c.json(fullProduct);
		}

		const { free_trial } = v1_2Body;

		if (v1_2Body.items) {
			await handleNewProductItems({
				db,
				curPrices: fullProduct.prices,
				curEnts: fullProduct.entitlements,
				newItems: v1_2Body.items,
				features,
				product: fullProduct,
				logger: ctx.logger,
				isCustom: false,
			});
		}

		// New full product
		const newFullProduct = await ProductService.getFull({
			db,
			idOrInternalId: v1_2Body.id || fullProduct.id,
			orgId: org.id,
			env,
		});

		if (free_trial !== undefined) {
			await validateOneOffTrial({
				prices: newFullProduct.prices,
				freeTrial: free_trial,
			});

			await handleNewFreeTrial({
				db,
				curFreeTrial: fullProduct.free_trial,
				newFreeTrial: free_trial,
				internalProductId: fullProduct.internal_id,
				isCustom: false,
			});
		}

		// New full product

		await initProductInStripe({
			ctx,
			product: newFullProduct,
		});

		logger.info("Adding task to queue to detect base variant");
		await addTaskToQueue({
			jobName: JobName.DetectBaseVariant,
			payload: {
				curProduct: newFullProduct,
			},
		});

		await addTaskToQueue({
			jobName: JobName.RewardMigration,
			payload: {
				oldPrices: fullProduct.prices,
				productId: v1_2Body.id || fullProduct.id,
				orgId: org.id,
				env,
			},
		});

		const planResponse = await getPlanResponse({
			product: newFullProduct,
			features,
		});

		const versionedResponse = applyResponseVersionChanges<ApiPlan>({
			input: planResponse,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Product,
			legacyData: {
				features: ctx.features,
			},
			ctx,
		});

		await invalidateProductsCache({ orgId: org.id, env });

		return c.json(versionedResponse);
	},
});
