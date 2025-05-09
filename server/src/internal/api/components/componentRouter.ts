import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { toPricecnProduct } from "@/internal/products/pricecn/pricecnUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isProductUpgrade } from "@/internal/products/productUtils.js";
import { getProductResponse } from "@/internal/products/productV2Utils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { FullCusProduct, CusProductStatus, ProductV2 } from "@autumn/shared";
import { Router } from "express";

export const componentRouter = Router();

componentRouter.get("/pricing_table", async (req: any, res) =>
  routeHandler({
    req,
    res,
    action: "get pricing table",
    handler: async () => {
      const { sb, orgId, env, logtail: logger } = req;
      let customerId = req.query.customer_id;

      const [org, features, products, customer] = await Promise.all([
        OrgService.getFromReq(req),
        FeatureService.getFeatures({ sb, orgId, env }),
        ProductService.getFullProducts({ sb, orgId, env }),
        (async () => {
          if (!customerId) {
            return null;
          }
          return await CusService.getById({
            sb,
            orgId,
            env,
            id: customerId,
            logger,
          });
        })(),
      ]);

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

      let cusProducts: FullCusProduct[] | null = null;

      if (customer) {
        cusProducts = await CusService.getFullCusProducts({
          sb,
          internalCustomerId: customer.internal_id,
          withProduct: true,
          withPrices: true,
          inStatuses: [
            CusProductStatus.Active,
            CusProductStatus.PastDue,
            CusProductStatus.Scheduled,
          ],
        });
      }

      let pricecnProds = await Promise.all(
        products.map(async (p) => {
          let prod = getProductResponse({ product: p, features });
          let curMainProduct, curScheduledProduct;

          if (cusProducts) {
            let res = await getExistingCusProducts({
              product: p,
              cusProducts: cusProducts,
            });

            curMainProduct = res.curMainProduct;
            curScheduledProduct = res.curScheduledProduct;
          }

          return toPricecnProduct({
            org,
            product: prod as ProductV2,
            features,
            curMainProduct,
            curScheduledProduct,
          });
        })
      );

      res.status(200).json({
        list: pricecnProds,
      });
    },
  })
);
