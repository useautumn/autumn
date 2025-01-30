import { apiAuthMiddleware } from "@/middleware/apiMiddleware.js";
import { Router } from "express";
import { eventsRouter } from "./events/eventRouter.js";
import { cusRouter } from "./customers/cusRouter.js";
import { productApiRouter } from "./products/productRouter.js";
import { priceRouter } from "./prices/priceRouter.js";

import { entitlementApiRouter } from "./entitlements/entitlementsRouter.js";
import { featureApiRouter } from "./features/featureApiRouter.js";
import { entitledRouter } from "./entitled/entitledRouter.js";
import { attachRouter } from "./customers/products/cusProductRouter.js";
import {
  sendFeatureEvent,
  sendProductEvent,
} from "@/external/autumn/autumnUtils.js";
import { OrgService } from "../orgs/OrgService.js";

const apiRouter = Router();

const pricingMiddleware = async (req: any, res: any, next: any) => {
  let path = req.url;
  let method = req.method;

  next();

  if (res.statusCode === 200) {
    if (path == "/features" && method === "POST") {
      const org = await OrgService.getFromReq(req);

      await sendFeatureEvent({
        org,
        env: req.env,
        incrementBy: 1,
      });
    }

    if (path.match(/^\/features\/[^\/]+$/) && method === "DELETE") {
      const org = await OrgService.getFromReq(req);

      await sendFeatureEvent({
        org,
        env: req.env,
        incrementBy: -1,
      });
    }

    if (path == "/products" && method === "POST") {
      const org = await OrgService.getFromReq(req);

      await sendProductEvent({
        org,
        env: req.env,
        incrementBy: 1,
      });
    }

    if (path.match(/^\/products\/[^\/]+$/) && method === "DELETE") {
      const org = await OrgService.getFromReq(req);

      await sendProductEvent({
        org,
        env: req.env,
        incrementBy: -1,
      });
    }
  }
};

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);

apiRouter.use("/attach", attachRouter);
apiRouter.use("/customers", cusRouter);
apiRouter.use("/products", productApiRouter);
apiRouter.use("/features", featureApiRouter);

apiRouter.use("/entitlements", entitlementApiRouter);
apiRouter.use("/events", eventsRouter);
apiRouter.use("/prices", priceRouter);
apiRouter.use("/entitled", entitledRouter);

export { apiRouter };
