import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { toPricecnProduct } from "@/internal/products/pricecn/pricecnUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isProductUpgrade } from "@/internal/products/productUtils.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ProductV2 } from "@autumn/shared";
import { Router } from "express";

export const componentRouter: Router = Router();

componentRouter.get("/pricing_table", async (req: any, res) =>
	routeHandler({
		req,
		res,
		action: "get pricing table",
		handler: async () => {
			const { orgId, env, db } = req;
			let customerId = req.query.customer_id;

			const [org, features, products, customer] = await Promise.all([
				OrgService.getFromReq(req),
				FeatureService.getFromReq(req),
				ProductService.listFull({ db, orgId, env }),
				(async () => {
					if (!customerId) {
						return undefined;
					}
					return await CusService.getFull({
						db,
						orgId,
						env,
						idOrInternalId: customerId,
					});
				})(),
			]);

			// Sort by add ons
			products.sort((a, b) => {
				return a.is_add_on ? 1 : -1;
			});

			// 1. Sort products by price
			products.sort((a, b) => {
				let isUpgradeA = isProductUpgrade({
					prices1: a.prices,
					prices2: b.prices,
					usageAlwaysUpgrade: false,
				});

				if (isUpgradeA) {
					return -1;
				} else {
					return 1;
				}
			});

			let batchResponse = [];
			for (let p of products) {
				let prod = await getProductResponse({ product: p, features });
				let curMainProduct, curScheduledProduct;

				if (customer) {
					let res = getExistingCusProducts({
						product: p,
						cusProducts: customer.customer_products,
					});

					curMainProduct = res.curMainProduct;
					curScheduledProduct = res.curScheduledProduct;
				}

				batchResponse.push(
					toPricecnProduct({
						db,
						org,
						product: prod as ProductV2,
						fullProduct: p,
						features,
						curMainProduct,
						curScheduledProduct,
						otherProducts: products.filter((other) => other.id != p.id),
						fullCus: customer,
					}),
				);
			}

			let pricecnProds = await Promise.all(batchResponse);

			// let pricecnProds = await Promise.all(
			//   products
			//     // .filter((p) => !p.is_add_on)
			//     .map(async (p) => {
			//       let prod = getProductResponse({ product: p, features });
			//       let curMainProduct, curScheduledProduct;

			//       if (cusProducts) {
			//         let res = getExistingCusProducts({
			//           product: p,
			//           cusProducts: cusProducts,
			//         });

			//         curMainProduct = res.curMainProduct;
			//         curScheduledProduct = res.curScheduledProduct;
			//       }

			//       return toPricecnProduct({
			//         org,
			//         product: prod as ProductV2,
			//         fullProduct: p,
			//         features,
			//         curMainProduct,
			//         curScheduledProduct,
			//         otherProducts: products.filter((other) => other.id != p.id),
			//       });
			//     }),
			// );

			res.status(200).json({
				list: pricecnProds,
			});
		},
	}),
);
