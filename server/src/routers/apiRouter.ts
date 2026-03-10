import { Hono } from "hono";
import { legacyAnalyticsRouter } from "@/internal/analytics/legacyAnalyticsRouter.js";
import { eventsRouter } from "@/internal/events/eventsRouter.js";
import { componentsRouter } from "@/internal/misc/components/componentsRouter.js";
import { configsRouter } from "@/internal/misc/configs/configsRouter.js";
import { analyticsMiddleware } from "../honoMiddlewares/analyticsMiddleware.js";
import { apiVersionMiddleware } from "../honoMiddlewares/apiVersionMiddleware.js";
import { idempotencyMiddleware } from "../honoMiddlewares/idempotencyMiddleware.js";
import { orgConfigMiddleware } from "../honoMiddlewares/orgConfigMiddleware.js";
import { queryMiddleware } from "../honoMiddlewares/queryMiddleware.js";
import { rateLimitMiddleware } from "../honoMiddlewares/rateLimitMiddleware.js";
import { refreshCacheMiddleware } from "../honoMiddlewares/refreshCacheMiddleware.js";
import { refreshProductsCacheMiddleware } from "../honoMiddlewares/refreshProductsCacheMiddleware.js";
import { responseFilterMiddleware } from "../honoMiddlewares/responseFilter/responseFilterMiddleware.js";
import { secretKeyMiddleware } from "../honoMiddlewares/secretKeyMiddleware.js";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";
import {
	redemptionRouter,
	referralRouter,
} from "../internal/api/rewards/referralRouter";
import { rewardProgramRouter } from "../internal/api/rewards/rewardProgramRouter";
import { rewardRouter } from "../internal/api/rewards/rewardRouter";
import { balancesRouter } from "../internal/balances/balancesRouter";
import { billingRouter } from "../internal/billing/billingRouter";
import { cusRouter } from "../internal/customers/cusRouter";
import { entityRouter } from "../internal/entities/entityRouter";
import { featureRouter } from "../internal/features/featureRouter";
import { invoiceRouter } from "../internal/invoices/invoiceRouter.js";
import { honoOrgRouter } from "../internal/orgs/orgRouter";
import { platformBetaRouter } from "../internal/platform/platformBeta/platformBetaRouter";
import {
	honoProductBetaRouter,
	honoProductRouter,
	migrationRouter,
} from "../internal/products/productRouter.js";
import { rpcRouter } from "./rpcRouter.js";

export const apiRouter = new Hono<HonoEnv>();

apiRouter.use("*", responseFilterMiddleware);
apiRouter.use("*", secretKeyMiddleware);
apiRouter.use("*", orgConfigMiddleware);
apiRouter.use("*", apiVersionMiddleware);
apiRouter.use("*", refreshCacheMiddleware);
apiRouter.use("*", refreshProductsCacheMiddleware);
apiRouter.use("*", analyticsMiddleware);
apiRouter.use("*", rateLimitMiddleware);
apiRouter.use("*", queryMiddleware());
apiRouter.use("*", idempotencyMiddleware);

apiRouter.route("", rpcRouter);
apiRouter.route("", billingRouter);
apiRouter.route("", balancesRouter);
apiRouter.route("", migrationRouter);
apiRouter.route("", entityRouter);
apiRouter.route("/customers", cusRouter);
apiRouter.route("/invoices", invoiceRouter);

apiRouter.route("/products_beta", honoProductBetaRouter);
apiRouter.route("/products", honoProductRouter);
apiRouter.route("/plans", honoProductRouter);
apiRouter.route("/features", featureRouter);

apiRouter.route("", balancesRouter);

apiRouter.route("/platform", platformBetaRouter);
apiRouter.route("/platform/beta", platformBetaRouter);

apiRouter.route("/organization", honoOrgRouter);

apiRouter.route("/rewards", rewardRouter);
apiRouter.route("/reward_programs", rewardProgramRouter);
apiRouter.route("/referrals", referralRouter);
apiRouter.route("/redemptions", redemptionRouter);
apiRouter.route("/query", legacyAnalyticsRouter);
apiRouter.route("/events", eventsRouter);

apiRouter.route("/configs", configsRouter);
apiRouter.route("/components", componentsRouter);
