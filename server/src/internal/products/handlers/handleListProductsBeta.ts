import { routeHandler } from "@/utils/routerUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { CusService } from "@/internal/customers/CusService.js";
import { sortFullProducts } from "../productUtils/sortProductUtils.js";
import { toPricecnProduct } from "../pricecn/pricecnUtils.js";
import { getProductResponse } from "../productUtils/productResponseUtils/getProductResponse.js";

export const handleListProductsBeta = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "list products v2 (beta)",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { org, features, env, db } = req;
      let customerId = req.query.customer_id;

      const [products, customer] = await Promise.all([
        ProductService.listFull({ db, orgId: org.id, env }),
        (async () => {
          if (!customerId) {
            return undefined;
          }
          return await CusService.getFull({
            db,
            orgId: org.id,
            env,
            idOrInternalId: customerId as string,
            allowNotFound: true,
          });
        })(),
      ]);

      if (req.query.v1_schema === "true") {
        res.status(200).json({
          list: products,
        });
        return;
      }

      sortFullProducts({ products });

      let batchResponse = [];
      for (let p of products) {
        batchResponse.push(
          getProductResponse({
            product: p,
            features,
            currency: org.default_currency || undefined,
            db,
            fullCus: customer ? customer : undefined,
          }),
        );
      }

      let productResponse = await Promise.all(batchResponse);

      res.status(200).json({
        list: productResponse,
      });
    },
  });
