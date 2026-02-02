import { Router } from "express";
import { analyticsMiddleware } from "@/middleware/analyticsMiddleware.js";
import { apiAuthMiddleware } from "@/middleware/apiAuthMiddleware.js";
import { expressApiVersionMiddleware } from "@/middleware/expressApiVersionMiddleware.js";
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";
import { refreshCacheMiddleware } from "@/middleware/refreshCacheMiddleware.js";

const apiRouter: Router = Router();

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);
apiRouter.use(analyticsMiddleware);
apiRouter.use(expressApiVersionMiddleware as any);
apiRouter.use(refreshCacheMiddleware);

export { apiRouter };
