import type { Context, Next } from "hono";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

export const orgRedisMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
): Promise<void> => {
	const ctx = c.get("ctx");
	const { ctx: routedCtx } = getCtxWithCustomerRedis({ ctx });
	c.set("ctx", routedCtx);
	await next();
};
