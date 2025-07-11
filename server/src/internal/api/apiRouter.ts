import { apiAuthMiddleware } from "@/middleware/apiAuthMiddleware.js";
import { Router } from "express";
import { eventsRouter } from "./events/eventRouter.js";
import { cusRouter } from "./cusRouter.js";
import { productBetaRouter, productRouter } from "../products/productRouter.js";

import { featureApiRouter } from "./features/featureApiRouter.js";
import { checkRouter } from "./entitled/checkRouter.js";
import { attachRouter } from "../customers/attach/attachRouter.js";
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";
import { usageRouter } from "./events/usageRouter.js";
import { invoiceRouter } from "./invoiceRouter.js";
import { entityRouter } from "./entities/entityRouter.js";
import { migrationRouter } from "../migrations/migrationRouter.js";

import { redemptionRouter, referralRouter } from "./rewards/referralRouter.js";
import { rewardProgramRouter } from "./rewards/rewardProgramRouter.js";
import { componentRouter } from "./components/componentRouter.js";
import { analyticsMiddleware } from "@/middleware/analyticsMiddleware.js";

import rewardRouter from "./rewards/rewardRouter.js";
import expireRouter from "../customers/expire/expireRouter.js";
import { handleSetupPayment } from "../customers/attach/handleSetupPayment.js";

const apiRouter: Router = Router();

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);
apiRouter.use(analyticsMiddleware);

apiRouter.use("/customers", cusRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/products", productRouter);
apiRouter.use("/products_beta", productBetaRouter);
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
apiRouter.use("", attachRouter);
apiRouter.use("/cancel", expireRouter);
apiRouter.use("/entitled", checkRouter);
apiRouter.use("/check", checkRouter);
apiRouter.use("/events", eventsRouter);
apiRouter.use("/track", eventsRouter);
apiRouter.post("/setup_payment", handleSetupPayment);

export { apiRouter };
