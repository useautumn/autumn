import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { traceEnrichMiddleware } from "@/honoMiddlewares/traceMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGenerateTrmnlScreen } from "./handlers/handleGenerateTrmnlScreen.js";
import { handleGetTrmnlDeviceId } from "./handlers/handleGetTrmnlDeviceId.js";
import { handlePostTrmnlDeviceId } from "./handlers/handlePostTrmnlDeviceId.js";
import { trmnlAuthMiddleware } from "./trmnlAuthMiddleware.js";

const trmnlScreenLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000 * 30,
	limit: process.env.NODE_ENV === "development" ? 1000 : 10,
	standardHeaders: "draft-6",
	keyGenerator: (c) => c.req.header("x-trmnl-id") ?? "unknown",
});

export const internalTrmnlRouter = new Hono<HonoEnv>();

internalTrmnlRouter.get("/device_id", ...handleGetTrmnlDeviceId);

internalTrmnlRouter.post("/device_id", ...handlePostTrmnlDeviceId);

export const publicTrmnlRouter = new Hono<HonoEnv>();
publicTrmnlRouter.post(
	"/screen",
	trmnlScreenLimiter,
	trmnlAuthMiddleware,
	traceEnrichMiddleware,
	...handleGenerateTrmnlScreen,
);
