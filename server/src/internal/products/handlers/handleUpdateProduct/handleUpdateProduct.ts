import {
	type FreeTrial,
	mapToProductV2,
	notNullish,
	ProductNotFoundError,
	type ProductV2,
	RecaseError,
	UpdateProductQuerySchema,
	UpdateProductSchema,
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
import { productsAreSame } from "../../productUtils/compareProductUtils.js";
import { getProductResponse } from "../../productUtils/productResponseUtils/getProductResponse.js";
import { initProductInStripe } from "../../productUtils.js";
import { disableCurrentDefault } from "../handleCreateProduct.js";
import { handleVersionProductV2 } from "../handleVersionProduct.js";
import { handleUpdateProductDetails } from "./updateProductDetails.js";

export const handleUpdateProductV2 = createRoute({
	body: UpdateProductV2ParamsSchema,
	query: UpdateProductQuerySchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const productId = c.req.param("productId");

		const { db, org, env, features, logger } = ctx;
		const { version, upsert, disable_version } = c.req.valid("query");

		const [fullProduct, rewardPrograms, _defaultProds] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
				version: version ? parseInt(version) : undefined,
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

		const newFreeTrial = body.free_trial as FreeTrial | undefined;
		const newProductV2: ProductV2 = {
			...curProductV2,
			...body,
			group: body.group || curProductV2.group || "",
			items: body.items || [],
			free_trial: newFreeTrial || curProductV2.free_trial || undefined,
		};

		await disableCurrentDefault({
			req: ctx,
			newProduct: newProductV2,
		});

		await handleUpdateProductDetails({
			db,
			curProduct: fullProduct,
			newProduct: UpdateProductSchema.parse(body),
			newFreeTrial: body.free_trial || curProductV2.free_trial || undefined,
			items: body.items || curProductV2.items,
			org,
			rewardPrograms,
			logger: ctx.logger,
		});

		const itemsExist = notNullish(body.items);

		const cusProductExists = cusProductsCurVersion.length > 0;

		if (cusProductExists && itemsExist) {
			if (disable_version) {
				throw new RecaseError({
					message: "Cannot auto save product as there are existing customers",
				});
			}

			const { itemsSame, freeTrialsSame } = productsAreSame({
				newProductV2: newProductV2,
				curProductV1: fullProduct,
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

				return c.json(newProduct);
			}

			return c.json(fullProduct);
		}

		const { free_trial } = body;

		if (body.items) {
			await handleNewProductItems({
				db,
				curPrices: fullProduct.prices,
				curEnts: fullProduct.entitlements,
				newItems: body.items,
				features,
				product: fullProduct,
				logger: ctx.logger,
				isCustom: false,
			});
		}

		// New full product
		const newFullProduct = await ProductService.getFull({
			db,
			idOrInternalId: body.id || fullProduct.id,
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
				product: fullProduct,
			});
		}

		// New full product
		await initProductInStripe({
			db,
			product: newFullProduct,
			org,
			env,
			logger,
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
				productId: body.id || fullProduct.id,
				orgId: org.id,
				env,
			},
		});

		const productResponse = await getProductResponse({
			product: newFullProduct,
			features,
		});

		return c.json(productResponse);
	},
});
