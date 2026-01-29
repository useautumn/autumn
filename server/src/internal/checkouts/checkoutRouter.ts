import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { handleConfirmCheckout } from "./handlers/handleConfirmCheckout";
import { handleGetCheckout } from "./handlers/handleGetCheckout";
import {
	checkoutMiddleware,
	checkoutRateLimiter,
} from "./middleware/checkoutMiddleware";

export const publicCheckoutRouter = new Hono<HonoEnv>();

// Apply rate limiter to all checkout routes
publicCheckoutRouter.use("/:checkout_id", checkoutRateLimiter);
publicCheckoutRouter.use("/:checkout_id/*", checkoutRateLimiter);

// Apply checkout middleware to fetch from cache
publicCheckoutRouter.use("/:checkout_id", checkoutMiddleware);
publicCheckoutRouter.use("/:checkout_id/*", checkoutMiddleware);

// Routes
publicCheckoutRouter.get("/:checkout_id", ...handleGetCheckout);
publicCheckoutRouter.post("/:checkout_id/confirm", ...handleConfirmCheckout);
