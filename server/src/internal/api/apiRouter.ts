import { Router } from "express";
import { analyticsMiddleware } from "@/middleware/analyticsMiddleware.js";
import { apiAuthMiddleware } from "@/middleware/apiAuthMiddleware.js";
import { expressApiVersionMiddleware } from "@/middleware/expressApiVersionMiddleware.js";
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";
import { refreshCacheMiddleware } from "@/middleware/refreshCacheMiddleware.js";
import { attachRouter } from "../customers/attach/attachRouter.js";
import cancelRouter from "../customers/cancel/cancelRouter.js";
import { expressCusRouter } from "../customers/cusRouter.js";
import { platformRouter } from "../platform/platformLegacy/platformRouter.js";
import { expressProductRouter } from "../products/productRouter.js";
import { componentRouter } from "./components/componentRouter.js";
import { rewardProgramRouter } from "./rewards/rewardProgramRouter.js";
import rewardRouter from "./rewards/rewardRouter.js";

const apiRouter: Router = Router();

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);
apiRouter.use(analyticsMiddleware);
apiRouter.use(expressApiVersionMiddleware as any);
apiRouter.use(refreshCacheMiddleware);

apiRouter.use("/components", componentRouter);
apiRouter.use("/rewards", rewardRouter);

// REWARDS
apiRouter.use("/reward_programs", rewardProgramRouter);

// Cus Product
apiRouter.use("", attachRouter);
apiRouter.use("/cancel", cancelRouter);

// Analytics
apiRouter.use("/platform", platformRouter);
apiRouter.use("/products", expressProductRouter);
apiRouter.use("/customers", expressCusRouter);

export { apiRouter };

// Features
// type: boolean, metered or credit system
// resets_periodically: true / false
