import { createStripeCli } from "@/external/connect/createStripeCli";
import { getPrimaryRedis } from "@/external/redis/initRedis";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const FALLBACK_CHECKOUT_LOCK_TTL_SECONDS = 2 * 60;

interface CheckoutSessionLockData {
	paramsHash: string;
	checkoutSessionUrl: string;
	checkoutSessionId: string;
	expiresAt?: number;
}

const buildKey = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => `checkout_lock:${ctx.org.id}:${ctx.env}:${customerId}`;

const get = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<CheckoutSessionLockData | null> => {
	try {
		return await CacheManager.getJson<CheckoutSessionLockData>(
			buildKey({ ctx, customerId }),
		);
	} catch (error) {
		ctx.logger.error(`Failed to get checkout session lock: ${error}`);
		return null;
	}
};

const set = async ({
	ctx,
	customerId,
	data,
}: {
	ctx: AutumnContext;
	customerId: string;
	data: CheckoutSessionLockData;
}): Promise<void> => {
	try {
		const ttlSeconds = data.expiresAt
			? Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 1000))
			: FALLBACK_CHECKOUT_LOCK_TTL_SECONDS;
		await CacheManager.setJson(buildKey({ ctx, customerId }), data, ttlSeconds);
	} catch (error) {
		ctx.logger.error(`Failed to set checkout session lock: ${error}`);
	}
};

const clearIfOwned = async ({
	ctx,
	customerId,
	checkoutSessionId,
}: {
	ctx: AutumnContext;
	customerId: string;
	checkoutSessionId: string;
}): Promise<void> => {
	try {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") {
			ctx.logger.warn(
				`Redis not ready — checkout reservation for ${customerId} left to TTL`,
			);
			return;
		}
		await redis.eval(
			`local value = redis.call("GET", KEYS[1])
			if not value then return 0 end
			local ok, lock = pcall(cjson.decode, value)
			if not ok or type(lock) ~= "table" or lock.checkoutSessionId ~= ARGV[1] then return 0 end
			return redis.call("DEL", KEYS[1])`,
			1,
			buildKey({ ctx, customerId }),
			checkoutSessionId,
		);
	} catch (error) {
		ctx.logger.error(`Failed to clear checkout session lock: ${error}`);
	}
};

/** Expires the session at Stripe then clears its reservation. False = the session
 * won the race (paid/completing) — the caller must not proceed to bill. */
const expireAndClearIfOwned = async ({
	ctx,
	customerId,
	checkoutSessionId,
}: {
	ctx: AutumnContext;
	customerId: string;
	checkoutSessionId: string;
}): Promise<boolean> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	try {
		await stripeCli.checkout.sessions.expire(checkoutSessionId);
	} catch (expireError) {
		// Stripe rejects expiring a completing/completed session — verify before dropping the guard.
		try {
			const checkoutSession =
				await stripeCli.checkout.sessions.retrieve(checkoutSessionId);
			if (checkoutSession.status !== "expired") {
				ctx.logger.info(
					`Checkout session ${checkoutSessionId} is ${checkoutSession.status}; keeping reservation`,
					{ expireError },
				);
				return false;
			}
		} catch (retrieveError) {
			ctx.logger.warn(
				`Could not verify checkout session ${checkoutSessionId}; keeping reservation`,
				{ expireError, retrieveError },
			);
			return false;
		}
	}

	await clearIfOwned({ ctx, customerId, checkoutSessionId });
	return true;
};

export const checkoutSessionLock = {
	get,
	set,
	clearIfOwned,
	expireAndClearIfOwned,
};
export type { CheckoutSessionLockData };
