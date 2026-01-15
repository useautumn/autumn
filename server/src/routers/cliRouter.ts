import { Hono } from "hono";
import { baseMiddleware } from "@/honoMiddlewares/baseMiddleware";
import type { HonoEnv } from "../honoUtils/HonoEnv";
import { cliDevRouter } from "../internal/dev/devRouter";

/**
 * Doesn't require authentication
 */
export const cliRouter = new Hono<HonoEnv>();
cliRouter.use("*", baseMiddleware);

cliRouter.route("/dev", cliDevRouter);
