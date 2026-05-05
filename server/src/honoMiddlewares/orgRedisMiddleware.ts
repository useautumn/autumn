import type { Context, Next } from "hono";
import { setCustomerRedisRouting } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

export const orgRedisMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
): Promise<void> => {
	const ctx = c.get("ctx");
	setCustomerRedisRouting({ ctx });
	await next();
};
