import { routeHandler } from "@/utils/routerUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { getProductResponse } from "@/internal/products/productV2Utils.js";

export const handleListProducts = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "List products",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const [org, features, products] = await Promise.all([
        OrgService.getFromReq(req),
        FeatureService.getFromReq(req),
        ProductService.getFullProducts({
          sb: req.sb,
          orgId: req.orgId,
          env: req.env,
        }),
      ]);

      let prods = products.map((p) =>
        getProductResponse({ product: p, features }),
      );

      if (req.query.v1_schema === "true") {
        res.status(200).json({
          list: products,
        });
        return;
      }

      res.status(200).json({
        list: prods,
      });
    },
  });
