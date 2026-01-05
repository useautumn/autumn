import {
    ErrCode,
    RecaseError
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { redis } from "@/external/redis/initRedis.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils";

/**
 * Middleware that checks for idempotence in a request
 */
export const idempotencyMiddleware = async (
    c: Context<HonoEnv>,
    next: Next,
) => {
    const headers = c.req.header();
    const ctx = c.get("ctx");
    const idempotencyKey = headers["idempotency-key"];

    if (idempotencyKey) {
        const redisKey = `${ctx.org.id}:${ctx.env}:idempotency:${idempotencyKey}`;
        // Use SET NX (set if not exists) for atomic check-and-set to prevent race conditions
        const wasSet = await tryRedisWrite(() => {
            return redis.set(redisKey, "1", "PX", 1000 * 60 * 60 * 24, "NX"); // 24 hours, only set if not exists
        });

        if (!wasSet) {
            throw new RecaseError({
                message: `Another request with idempotency key ${idempotencyKey} has already been received`,
                code: ErrCode.DuplicateIdempotencyKey,
                statusCode: 409,
            })
        }
    }

    await next();
};