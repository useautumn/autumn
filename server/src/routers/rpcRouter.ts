import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { featureRpcRouter } from "@/internal/features/featureRpcRouter.js";

export const rpcRouter = new Hono<HonoEnv>();

rpcRouter.route("", featureRpcRouter);
