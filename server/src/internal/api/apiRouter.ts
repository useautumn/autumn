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
import { invoiceRouter } from "./customers/invoiceRouter.js";
import { entityRouter } from "./entities/entityRouter.js";
import { migrationRouter } from "./migrations/migrationRouter.js";
import rewardRouter from "./rewards/rewardRouter.js";

import { redemptionRouter, referralRouter } from "./rewards/referralRouter.js";
import { rewardProgramRouter } from "./rewards/rewardProgramRouter.js";
import expireRouter from "./customers/products/expireRouter.js";
import { componentRouter } from "./components/componentRouter.js";

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

  // Store JSON response
  let originalJson = res.json;

  res.json = function (body: any) {
    res.locals.responseBody = body;
    return originalJson.call(this, body);
  };

  // Log response after it's sent
  let skipUrls = ["/v1/customers/all/search"];
  res.on("finish", () => {
    try {
      req.logtail.flush();
      if (skipUrls.includes(req.originalUrl)) {
        return;
      }
      req.logtailAll.info(
        `[${res.statusCode}] ${req.method} ${req.originalUrl} (${req.minOrg?.slug})`,
        {
          req: {
            ...logtailContext,
          },
          statusCode: res.statusCode,
          res: res.locals.responseBody,
        }
      );
      req.logtailAll.flush();
    } catch (error) {
      console.error("Failed to log response to logtailAll");
      console.error(error);
    }
  });

  next();
});

apiRouter.get("/auth", (req: any, res) => {
  res.json({
    message: `Authenticated -- Hello ${req.minOrg?.slug}!`,
  });
});

apiRouter.use("/customers", cusRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/products", productApiRouter);
apiRouter.use("/components", componentRouter);
apiRouter.use("/rewards", rewardRouter);
apiRouter.use("/features", featureApiRouter);

apiRouter.use("/entitlements", entitlementApiRouter);

apiRouter.use("/prices", priceRouter);

apiRouter.use("/usage", usageRouter);
apiRouter.use("/entities", entityRouter);
apiRouter.use("/migrations", migrationRouter);

// REWARDS
apiRouter.use("/reward_programs", rewardProgramRouter);
apiRouter.use("/referrals", referralRouter);
apiRouter.use("/redemptions", redemptionRouter);

// Cus Product
apiRouter.use(attachRouter);
apiRouter.use("/cancel", expireRouter);
apiRouter.use("/entitled", entitledRouter);
apiRouter.use("/check", entitledRouter);

apiRouter.use("/events", eventsRouter);
apiRouter.use("/track", eventsRouter);

export { apiRouter };
