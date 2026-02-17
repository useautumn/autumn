import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { planRpcRouter } from "../internal/products/planRpcRouter.js";

export const rpcRouter = new Hono<HonoEnv>();

rpcRouter.route("", planRpcRouter);
