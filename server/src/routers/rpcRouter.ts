import { Hono } from "hono";
import { referralRpcRouter } from "@/internal/api/rewards/referralRouter";
import { balancesRpcRouter } from "@/internal/balances/balancesRouter";
import { billingRpcRouter } from "@/internal/billing/billingRouter";
import { entityRpcRouter } from "@/internal/entities/entityRouter";
import { eventsRpcRouter } from "@/internal/events/eventsRouter";
import { featureRpcRouter } from "@/internal/features/featureRouter";
import { plansRpcRouter } from "@/internal/products/productRouter";
import type { HonoEnv } from "../honoUtils/HonoEnv";
import { customerRpcRouter } from "../internal/customers/cusRouter";

export const rpcRouter = new Hono<HonoEnv>();

// rpcRouter.use("*", responseFilterMiddleware);
// rpcRouter.use("*", secretKeyMiddleware);
// rpcRouter.use("*", orgConfigMiddleware);
// rpcRouter.use("*", apiVersionMiddleware);
// rpcRouter.use("*", refreshCacheMiddleware);
// rpcRouter.use("*", refreshProductsCacheMiddleware);
// rpcRouter.use("*", analyticsMiddleware);
// rpcRouter.use("*", rateLimitMiddleware);
// rpcRouter.use("*", queryMiddleware());
// rpcRouter.use("*", idempotencyMiddleware);

rpcRouter.route("", customerRpcRouter);
rpcRouter.route("", plansRpcRouter);
rpcRouter.route("", billingRpcRouter);
rpcRouter.route("", balancesRpcRouter);
rpcRouter.route("", eventsRpcRouter);
rpcRouter.route("", referralRpcRouter);
rpcRouter.route("", entityRpcRouter);
rpcRouter.route("", featureRpcRouter);
