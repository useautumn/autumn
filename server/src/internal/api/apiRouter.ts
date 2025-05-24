import { apiAuthMiddleware } from "@/middleware/apiMiddleware.js";
import { Router } from "express";
import { eventsRouter } from "./events/eventRouter.js";
import { cusRouter } from "./customers/cusRouter.js";
import { productApiRouter } from "./products/productRouter.js";

import { featureApiRouter } from "./features/featureApiRouter.js";
import { entitledRouter } from "./entitled/entitledRouter.js";
import { attachRouter } from "./customers/products/attachRouter.js";
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";
import { usageRouter } from "./events/usageRouter.js";
import { invoiceRouter } from "./customers/invoiceRouter.js";
import { entityRouter } from "./entities/entityRouter.js";
import { migrationRouter } from "./migrations/migrationRouter.js";

import { redemptionRouter, referralRouter } from "./rewards/referralRouter.js";
import { rewardProgramRouter } from "./rewards/rewardProgramRouter.js";
import { componentRouter } from "./components/componentRouter.js";
import { analyticsMiddleware } from "@/middleware/analyticsMiddleware.js";

import rewardRouter from "./rewards/rewardRouter.js";
import expireRouter from "./customers/products/expireRouter.js";

const apiRouter = Router();

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);
apiRouter.use(analyticsMiddleware);

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
