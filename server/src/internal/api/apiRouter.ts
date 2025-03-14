import { apiAuthMiddleware } from "@/middleware/apiMiddleware.js";
import { Router } from "express";
import { eventsRouter } from "./events/eventRouter.js";
import { cusRouter } from "./customers/cusRouter.js";
import { productApiRouter } from "./products/productRouter.js";
import { priceRouter } from "./prices/priceRouter.js";

import { entitlementApiRouter } from "./entitlements/entitlementsRouter.js";
import { featureApiRouter } from "./features/featureApiRouter.js";
import { entitledRouter } from "./entitled/entitledRouter.js";
import { attachRouter } from "./customers/products/attachRouter.js";
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";
import { usageRouter } from "./events/usageRouter.js";
import couponRouter from "./coupons/couponRouter.js";
import { invoiceRouter } from "./customers/invoiceRouter.js";
import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";

const apiRouter = Router();

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);
apiRouter.use((req: any, res: any, next: any) => {
  const logtailContext: any = {
    org_id: req.minOrg?.id,
    org_slug: req.minOrg?.slug,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    env: req.env,
  };
  req.logtail.use((log: any) => {
    return {
      ...log,
      ...logtailContext,
    };
  });
  // try {

  // } catch (error) {
  //   console.error("Failed to add context to logtail in API middleware");
  //   console.error(error);
  //   req.logtail = createLogtailWithContext(logtailContext);
  // }

  next();
});

apiRouter.use(attachRouter);

apiRouter.get("/auth", (req: any, res) => {
  res.json({
    message: `Authenticated -- Hello ${req.minOrg?.slug}!`,
  });
});

apiRouter.use("/customers", cusRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/products", productApiRouter);
apiRouter.use("/coupons", couponRouter);
apiRouter.use("/features", featureApiRouter);

apiRouter.use("/entitlements", entitlementApiRouter);
apiRouter.use("/events", eventsRouter);
apiRouter.use("/prices", priceRouter);
apiRouter.use("/entitled", entitledRouter);
apiRouter.use("/usage", usageRouter);

export { apiRouter };
