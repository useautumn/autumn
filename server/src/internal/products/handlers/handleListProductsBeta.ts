// import { ProductService } from "@/internal/products/ProductService.js";
// import type {
// 	ExtendedRequest,
// 	ExtendedResponse,
// } from "@/utils/models/Request.js";
// import { routeHandler } from "@/utils/routerUtils.js";
// import { CusService } from "../../customers/CusService.js";
// import { getProductResponse } from "../productUtils/productResponseUtils/getProductResponse.js";
// import { sortFullProducts } from "../productUtils/sortProductUtils.js";

// // biome-ignore lint/suspicious/noExplicitAny: alright buddy WRAP it up 👉🚪
// export const handleListProductsBeta = async (req: any, res: any) =>
// 	routeHandler({
// 		req,
// 		res,
// 		action: "list products v2 (beta)",
// 		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
// 			const { org, features, env, db } = req;
// 			const customerId = req.query.customer_id;
// 			const entityId = req.query.entity_id as string | undefined;
// 			const includeAll = req.query.include_archived as unknown as boolean;

// 			const [products, customer] = await Promise.all([
// 				ProductService.listFull({
// 					db,
// 					orgId: org.id,
// 					env,
// 					archived: includeAll ? undefined : false,
// 				}),
// 				(async () => {
// 					if (!customerId) {
// 						return undefined;
// 					}

// 					return await CusService.getFull({
// 						db,
// 						idOrInternalId: customerId as string,
// 						orgId: org.id,
// 						env,
// 						entityId: entityId as string,
// 						withEntities: true,
// 						withSubs: true,
// 					});
// 				})(),
// 			]);

// 			if (req.query.v1_schema === "true") {
// 				res.status(200).json({
// 					list: products,
// 				});
// 				return;
// 			}

// 			sortFullProducts({ products });

// 			const batchResponse = [];
// 			for (const p of products) {
// 				batchResponse.push(
// 					getProductResponse({
// 						product: p,
// 						features,
// 						currency: org.default_currency || undefined,
// 						db,
// 						fullCus: customer ? customer : undefined,
// 					}),
// 				);
// 			}

// 			const productResponse = await Promise.all(batchResponse);

// 			res.status(200).json({
// 				list: productResponse,
// 			});
// 		},
// 	});
