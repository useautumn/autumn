import { Hono } from "hono";
import { analyticsMiddleware } from "../honoMiddlewares/analyticsMiddleware.js";
import { apiVersionMiddleware } from "../honoMiddlewares/apiVersionMiddleware.js";
import { orgConfigMiddleware } from "../honoMiddlewares/orgConfigMiddleware.js";
import { queryMiddleware } from "../honoMiddlewares/queryMiddleware.js";
import { rateLimitMiddleware } from "../honoMiddlewares/rateLimitMiddleware.js";
import { refreshCacheMiddleware } from "../honoMiddlewares/refreshCacheMiddleware.js";
import { secretKeyMiddleware } from "../honoMiddlewares/secretKeyMiddleware.js";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";
import {
	redemptionRouter,
	referralRouter,
} from "../internal/api/rewards/referralRouter.js";
import { balancesRouter } from "../internal/balances/balancesRouter.js";
import { billingRouter } from "../internal/billing/billingRouter.js";
import { cusRouter } from "../internal/customers/cusRouter.js";
import { entityRouter } from "../internal/entities/entityRouter.js";
import { featureRouter } from "../internal/features/featureRouter.js";
import { honoOrgRouter } from "../internal/orgs/orgRouter.js";
import { platformBetaRouter } from "../internal/platform/platformBeta/platformBetaRouter.js";
import {
	honoProductBetaRouter,
	honoProductRouter,
	migrationRouter,
} from "../internal/products/productRouter.js";

export const apiRouter = new Hono<HonoEnv>();

apiRouter.use("*", secretKeyMiddleware);
apiRouter.use("*", orgConfigMiddleware);
apiRouter.use("*", apiVersionMiddleware);
apiRouter.use("*", analyticsMiddleware);
apiRouter.use("*", rateLimitMiddleware);
apiRouter.use("*", refreshCacheMiddleware);
apiRouter.use("*", queryMiddleware());

apiRouter.route("", billingRouter);
apiRouter.route("", balancesRouter);
apiRouter.route("", migrationRouter);
apiRouter.route("", entityRouter);
apiRouter.route("/customers", cusRouter);

apiRouter.route("/products_beta", honoProductBetaRouter);
apiRouter.route("/products", honoProductRouter);
apiRouter.route("/plans", honoProductRouter);
apiRouter.route("/features", featureRouter);

apiRouter.route("", balancesRouter);
apiRouter.route("/platform", platformBetaRouter);
apiRouter.route("/platform/beta", platformBetaRouter);
apiRouter.route("/organization", honoOrgRouter);

apiRouter.route("/referrals", referralRouter);
apiRouter.route("/redemptions", redemptionRouter);
