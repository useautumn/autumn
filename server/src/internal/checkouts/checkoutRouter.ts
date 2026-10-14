import { Hono } from "hono";
import { analyticsMiddleware } from "@/honoMiddlewares/analyticsMiddleware";
import { traceEnrichMiddleware } from "@/honoMiddlewares/traceMiddleware";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { handleConfirmCheckout } from "./handlers/handleConfirmCheckout";
import { handleGetCheckout } from "./handlers/handleGetCheckout";
import { handlePreviewCheckout } from "./handlers/handlePreviewCheckout";
import { handleStartLongLivedCheckout } from "./handlers/handleStartLongLivedCheckout";
import {
	checkoutMiddleware,
	checkoutRateLimiter,
} from "./middleware/checkoutMiddleware";

export const publicCheckoutRouter = new Hono<HonoEnv>();
publicCheckoutRouter.use("/:checkout_id", checkoutRateLimiter);
publicCheckoutRouter.use("/:checkout_id/*", checkoutRateLimiter);

publicCheckoutRouter.use("/:checkout_id", checkoutMiddleware);
publicCheckoutRouter.use("/:checkout_id/*", checkoutMiddleware);

publicCheckoutRouter.use("/:checkout_id/*", analyticsMiddleware);

publicCheckoutRouter.use("/:checkout_id", traceEnrichMiddleware);
publicCheckoutRouter.use("/:checkout_id/*", traceEnrichMiddleware);

publicCheckoutRouter.get("/:checkout_id", ...handleGetCheckout);
publicCheckoutRouter.post("/:checkout_id/preview", ...handlePreviewCheckout);
publicCheckoutRouter.post("/:checkout_id/confirm", ...handleConfirmCheckout);
publicCheckoutRouter.get("/:checkout_id/start", ...handleStartLongLivedCheckout);
