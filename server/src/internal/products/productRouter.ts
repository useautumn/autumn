import { ProductNotFoundError } from "@autumn/shared";

import { Router } from "express";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { checkStripeProductExists } from "@/internal/products/productUtils.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusProductService } from "../customers/cusProducts/CusProductService.js";
import { handleCopyProduct } from "./handlers/handleCopyProduct.js";
import { handleDeleteProduct } from "./handlers/handleDeleteProduct.js";
import { handleGetProduct } from "./handlers/handleGetProduct.js";
import { handleGetProductDeleteInfo } from "./handlers/handleGetProductDeleteInfo.js";
import { handleListProductsBeta } from "./handlers/handleListProductsBeta.js";
import { productsAreSame } from "./productUtils/compareProductUtils.js";

export const productBetaRouter: Router = Router();
productBetaRouter.get("", handleListProductsBeta);

export const productRouter: Router = Router();

productRouter.get("", handleListProductsBeta);

productRouter.get("/:productId", handleGetProduct);

// productRouter.post("/:productId", handleUpdateProductV2);

productRouter.delete("/:productId", handleDeleteProduct);

productRouter.post("/:productId/copy", handleCopyProduct);

productRouter.post("/all/init_stripe", async (req: any, res) => {
	try {
		const { orgId, env, logger, db } = req;

		const [fullProducts, org] = await Promise.all([
			ProductService.listFull({
				db,
				orgId,
				env,
			}),
			OrgService.getFromReq(req),
		]);

		console.log(
			"fullProducts",
			fullProducts.map((p) => p.id),
		);

		const stripeCli = createStripeCli({
			org,
			env,
		});

		const productBatchSize = 5;
		for (let i = 0; i < fullProducts.length; i += productBatchSize) {
			const batch = fullProducts.slice(i, i + productBatchSize);
			const batchPromises = batch.map((product) =>
				checkStripeProductExists({
					db,
					org,
					env,
					product,
					logger,
				}),
			);
			await Promise.all(batchPromises);
		}

		const entitlements = fullProducts.flatMap((p) => p.entitlements);
		const prices = fullProducts.flatMap((p) => p.prices);

		const batchSize = 3;
		for (let i = 0; i < prices.length; i += batchSize) {
			const batch = prices.slice(i, i + batchSize);
			const batchPriceUpdate = [];
			for (const price of batch) {
				batchPriceUpdate.push(
					createStripePriceIFNotExist({
						db,
						org,
						stripeCli: stripeCli,
						price,
						entitlements,
						product: fullProducts.find(
							(p) => p.internal_id === price.internal_product_id,
						)!,
						logger,
					}),
				);
			}

			await Promise.all(batchPriceUpdate);
		}
		res.status(200).json({ message: "Stripe products initialized" });
	} catch (error) {
		handleRequestError({ req, error, res, action: "Init stripe products" });
	}
});

productRouter.get("/:productId/has_customers", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Get product has customers",
		handler: async () => {
			const { productId } = req.params;
			const { db, features } = req;
			const { id, items, free_trial } = req.body;

			const product = await ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: req.orgId,
				env: req.env,
			});

			if (!product) {
				throw new ProductNotFoundError({ productId });
			}

			const cusProductsCurVersion =
				await CusProductService.getByInternalProductId({
					db,
					internalProductId: product.internal_id,
				});

			const { itemsSame, freeTrialsSame } = productsAreSame({
				newProductV2: req.body,
				curProductV1: product,
				features,
			});

			const productSame = itemsSame && freeTrialsSame;

			res.status(200).json({
				current_version: product.version,
				will_version: !productSame && cusProductsCurVersion.length > 0,
				archived: product.archived,
			});
		},
	}),
);

productRouter.get("/:productId/deletion_info", handleGetProductDeleteInfo);

import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createProduct } from "./handlers/handleCreateProduct.js";
import { handleUpdateProductV2 } from "./handlers/handleUpdateProduct/handleUpdateProduct.js";

// Create a Hono app for products
export const honoProductRouter = new Hono<HonoEnv>();

// POST /products - Create a product
honoProductRouter.post("", ...createProduct);
honoProductRouter.patch("/:productId", ...handleUpdateProductV2);
honoProductRouter.post("/:productId", ...handleUpdateProductV2); // will be deprecated
