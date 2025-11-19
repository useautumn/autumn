import { ProductNotFoundError, productsAreSame } from "@autumn/shared";
import { routeHandler } from "../../../utils/routerUtils.js";
import { CusProductService } from "../../customers/cusProducts/CusProductService.js";
import { ProductService } from "../ProductService.js";

export const handlePlanHasCustomers = (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Get product has customers",
		handler: async (req: any, res: any) => {
			const { product_id } = req.params;
			const { db, features } = req;

			const product = await ProductService.getFull({
				db,
				idOrInternalId: product_id,
				orgId: req.orgId,
				env: req.env,
			});

			if (!product) {
				throw new ProductNotFoundError({ productId: product_id });
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
	});
