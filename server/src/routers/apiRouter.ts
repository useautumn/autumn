import { Hono } from "hono";
import { insightsRouter } from "@/internal/analytics/insightsRouter";
import { legacyAnalyticsRouter } from "@/internal/analytics/legacyAnalyticsRouter";
import { eventsRouter } from "@/internal/events/eventsRouter";
import { analyticsMiddleware } from "../honoMiddlewares/analyticsMiddleware";
import { apiVersionMiddleware } from "../honoMiddlewares/apiVersionMiddleware";
import { idempotencyMiddleware } from "../honoMiddlewares/idempotencyMiddleware";
import { orgConfigMiddleware } from "../honoMiddlewares/orgConfigMiddleware";
import { queryMiddleware } from "../honoMiddlewares/queryMiddleware";
import { rateLimitMiddleware } from "../honoMiddlewares/rateLimitMiddleware";
import { refreshCacheMiddleware } from "../honoMiddlewares/refreshCacheMiddleware";
import { secretKeyMiddleware } from "../honoMiddlewares/secretKeyMiddleware";
import type { HonoEnv } from "../honoUtils/HonoEnv";
import {
	redemptionRouter,
	referralRouter,
} from "../internal/api/rewards/referralRouter";
import { balancesRouter } from "../internal/balances/balancesRouter";
import { billingRouter } from "../internal/billing/billingRouter";
import { cusRouter } from "../internal/customers/cusRouter";
import { entityRouter } from "../internal/entities/entityRouter";
import { featureRouter } from "../internal/features/featureRouter";
import { honoOrgRouter } from "../internal/orgs/orgRouter";
import { platformBetaRouter } from "../internal/platform/platformBeta/platformBetaRouter";
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
apiRouter.use("*", idempotencyMiddleware);

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
apiRouter.route("/insights", insightsRouter);
apiRouter.route("/query", legacyAnalyticsRouter);
apiRouter.route("/events", eventsRouter);
