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
import { pricingMiddleware } from "@/middleware/pricingMiddleware.js";

const apiRouter = Router();

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
