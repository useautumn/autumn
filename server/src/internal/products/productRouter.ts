import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCopyProductV2 } from "./handlers/handleCopyProduct/handleCopyProductV2.js";
import { handleCreatePlan } from "./handlers/handleCreatePlan.js";
import { handleDeleteProduct as handleDeleteProductHono } from "./handlers/handleDeleteProduct.js";
import { handleGetPlan } from "./handlers/handleGetPlan.js";
import { handleGetPlanDeleteInfo } from "./handlers/handleGetPlanDeleteInfo.js";
import { handleListPlans } from "./handlers/handleListPlans.js";
import { handleMigrateProductV2 } from "./handlers/handleMigrateProductV2.js";
import { handlePlanHasCustomers } from "./handlers/handlePlanHasCustomers.js";
import { handleUpdatePlan } from "./handlers/handleUpdateProduct/handleUpdatePlan.js";

export const honoProductBetaRouter = new Hono<HonoEnv>();
honoProductBetaRouter.get("", ...handleListPlans);

// Create a Hono app for products
export const honoProductRouter = new Hono<HonoEnv>();
export const migrationRouter = new Hono<HonoEnv>();

// Migrations
migrationRouter.post("/migrations", ...handleMigrateProductV2);

// CRUD
honoProductRouter.get("", ...handleListPlans);
honoProductRouter.post("", ...handleCreatePlan);
honoProductRouter.get("/:product_id", ...handleGetPlan);
honoProductRouter.post("/:product_id", ...handleUpdatePlan); // will be deprecated
honoProductRouter.patch("/:product_id", ...handleUpdatePlan); // will be deprecated
honoProductRouter.delete("/:product_id", ...handleDeleteProductHono);

// Others
honoProductRouter.post("/:product_id/copy", ...handleCopyProductV2);

// Info before deleting plan
honoProductRouter.get("/:product_id/has_customers", ...handlePlanHasCustomers);
honoProductRouter.get("/:product_id/deletion_info", ...handleGetPlanDeleteInfo);

// productRouter.post("/all/init_stripe", async (req: any, res) => {
// 	try {
// 		const { orgId, env, logger, db } = req;

// 		const [fullProducts, org] = await Promise.all([
// 			ProductService.listFull({
// 				db,
// 				orgId,
// 				env,
// 			}),
// 			OrgService.getFromReq(req),
// 		]);

// 		console.log(
// 			"fullProducts",
// 			fullProducts.map((p) => p.id),
// 		);

// 		const stripeCli = createStripeCli({
// 			org,
// 			env,
// 		});

// 		const productBatchSize = 5;
// 		for (let i = 0; i < fullProducts.length; i += productBatchSize) {
// 			const batch = fullProducts.slice(i, i + productBatchSize);
// 			const batchPromises = batch.map((product) =>
// 				checkStripeProductExists({
// 					db,
// 					org,
// 					env,
// 					product,
// 					logger,
// 				}),
// 			);
// 			await Promise.all(batchPromises);
// 		}

// 		const entitlements = fullProducts.flatMap((p) => p.entitlements);
// 		const prices = fullProducts.flatMap((p) => p.prices);

// 		const batchSize = 3;
// 		for (let i = 0; i < prices.length; i += batchSize) {
// 			const batch = prices.slice(i, i + batchSize);
// 			const batchPriceUpdate = [];
// 			for (const price of batch) {
// 				batchPriceUpdate.push(
// 					createStripePriceIFNotExist({
// 						db,
// 						org,
// 						stripeCli: stripeCli,
// 						price,
// 						entitlements,
// 						product: fullProducts.find(
// 							(p) => p.internal_id === price.internal_product_id,
// 						)!,
// 						logger,
// 					}),
// 				);
// 			}

// 			await Promise.all(batchPriceUpdate);
// 		}
// 		res.status(200).json({ message: "Stripe products initialized" });
// 	} catch (error) {
// 		handleRequestError({ req, error, res, action: "Init stripe products" });
// 	}
// });
