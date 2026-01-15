import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGenerateTrmnlScreen } from "./handlers/handleGenerateTrmnlScreen.js";
import { handleGetTrmnlDeviceId } from "./handlers/handleGetTrmnlDeviceId.js";
import { handlePostTrmnlDeviceId } from "./handlers/handlePostTrmnlDeviceId.js";
import { trmnlAuthMiddleware } from "./trmnlAuthMiddleware.js";

// TRMNL rate limiter: 10 requests per 30 minutes in production, 1000 in dev
const trmnlScreenLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000 * 30, // 30 minutes
	limit: process.env.NODE_ENV === "development" ? 1000 : 10,
	standardHeaders: "draft-6",
	keyGenerator: (c) => c.req.header("x-trmnl-id") ?? "unknown",
});

export const internalTrmnlRouter = new Hono<HonoEnv>();

// GET /device_id - Get TRMNL device config (requires session auth)
internalTrmnlRouter.get("/device_id", ...handleGetTrmnlDeviceId);

// POST /device_id - Save TRMNL device config (requires session auth)
internalTrmnlRouter.post("/device_id", ...handlePostTrmnlDeviceId);

// Call this publicTrmnlRouter
export const publicTrmnlRouter = new Hono<HonoEnv>();
publicTrmnlRouter.post(
	"/screen",
	trmnlScreenLimiter,
	trmnlAuthMiddleware,
	...handleGenerateTrmnlScreen,
);
