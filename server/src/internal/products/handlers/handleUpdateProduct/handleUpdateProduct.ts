import {
	CreateProductV2ParamsSchema,
	mapToProductV2,
	notNullish,
	ProductNotFoundError,
	ProductV2Schema,
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
		// const { productId } = req.params;
		// const { orgId, env, logger, db } = req;

		const [fullProduct, rewardPrograms, _defaultProds] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
				version: version ? parseInt(version) : undefined,
				allowNotFound: upsert === "true",
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

		// // How to go into another route handler?
		// if (upsert === "true") await handleCreateProduct(c);

		// Start a transaction?

		const cusProductsCurVersion =
			await CusProductService.getByInternalProductId({
				db,
				internalProductId: fullProduct.internal_id,
			});

		const curProductV2 = mapToProductV2({
			product: fullProduct,
			features,
		});

		const cusProductExists = cusProductsCurVersion.length > 0;

		await disableCurrentDefault({
			req: ctx,
			newProduct: CreateProductV2ParamsSchema.parse({
				...fullProduct,
				...body,
			}),
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

		if (cusProductExists && itemsExist) {
			const newProductV2 = ProductV2Schema.parse({
				...body,
				items: body.items || [],
			});

			if (disable_version === "true") {
				throw new RecaseError({
					message: "Cannot auto save product as there are existing customers",
				});
			}

			const { itemsSame, freeTrialsSame } = productsAreSame({
				newProductV2,
				curProductV1: fullProduct,
				features,
			});

			const productSame = itemsSame && freeTrialsSame;

			if (!productSame) {
				const newProduct = await handleVersionProductV2({
					ctx,
					newProductV2,
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
			idOrInternalId: fullProduct.id,
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
				productId: fullProduct.id,
				orgId: org.id,
				env,
			},
		});

		return c.json(
			getProductResponse({
				product: newFullProduct,
				features,
			}),
		);
	},
});
