import { Router } from "express";
import { analyticsMiddleware } from "@/middleware/analyticsMiddleware.js";
import { apiAuthMiddleware } from "@/middleware/apiAuthMiddleware.js";
import { expressApiVersionMiddleware } from "@/middleware/expressApiVersionMiddleware.js";
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";
import { refreshCacheMiddleware } from "@/middleware/refreshCacheMiddleware.js";
import { analyticsRouter } from "../analytics/analyticsRouter.js";
import { attachRouter } from "../customers/attach/attachRouter.js";
import { handleSetupPayment } from "../customers/attach/handleSetupPayment.js";
import cancelRouter from "../customers/cancel/cancelRouter.js";
import { expressCusRouter } from "../customers/cusRouter.js";
import { handleCreateBillingPortal } from "../customers/handlers/handleCreateBillingPortal.js";
import { featureRouter } from "../features/featureRouter.js";
import { internalFeatureRouter } from "../features/internalFeatureRouter.js";
import { handleGetOrg } from "../orgs/handlers/handleGetOrg.js";
import { platformRouter } from "../platform/platformLegacy/platformRouter.js";
import { productBetaRouter, productRouter } from "../products/productRouter.js";
import { componentRouter } from "./components/componentRouter.js";
import { entityRouter } from "./entities/entityRouter.js";
import { eventsRouter } from "./events/eventRouter.js";
import { usageRouter } from "./events/usageRouter.js";
import { invoiceRouter } from "./invoiceRouter.js";
import { redemptionRouter, referralRouter } from "./rewards/referralRouter.js";
import { rewardProgramRouter } from "./rewards/rewardProgramRouter.js";
import rewardRouter from "./rewards/rewardRouter.js";

const apiRouter: Router = Router();

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);
apiRouter.use(analyticsMiddleware);
apiRouter.use(expressApiVersionMiddleware as any);
apiRouter.use(refreshCacheMiddleware);

apiRouter.use("/customers", expressCusRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/products", productRouter);
apiRouter.use("/products_beta", productBetaRouter);
apiRouter.use("/components", componentRouter);
apiRouter.use("/rewards", rewardRouter);
apiRouter.use("/features", featureRouter);
apiRouter.use("/internal_features", internalFeatureRouter);

apiRouter.use("/usage", usageRouter);
apiRouter.use("/entities", entityRouter);

// REWARDS
apiRouter.use("/reward_programs", rewardProgramRouter);
apiRouter.use("/referrals", referralRouter);
apiRouter.use("/redemptions", redemptionRouter);

// Cus Product
apiRouter.use("", attachRouter);
apiRouter.use("/cancel", cancelRouter);

apiRouter.use("/events", eventsRouter);
apiRouter.use("/track", eventsRouter);
apiRouter.post("/setup_payment", handleSetupPayment);
apiRouter.post("/billing_portal", handleCreateBillingPortal);

// Analytics
apiRouter.use("/query", analyticsRouter);
apiRouter.use("/platform", platformRouter);

// // Used for tests...
// apiRouter.post("/organization/stripe", ...handleConnectStripe);
// apiRouter.delete("/organization/stripe", ...handleDeleteStripe);
apiRouter.get("/organization", handleGetOrg);

export { apiRouter };
