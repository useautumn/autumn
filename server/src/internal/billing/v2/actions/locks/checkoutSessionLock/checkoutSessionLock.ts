import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getPrimaryRedis } from "@/external/redis/initRedis";
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
		if (redis.status !== "ready") return;
		await redis.eval(
			`local value = redis.call("GET", KEYS[1])
			if not value then return 0 end
			local lock = cjson.decode(value)
			if lock.checkoutSessionId ~= ARGV[1] then return 0 end
			return redis.call("DEL", KEYS[1])`,
			1,
			buildKey({ ctx, customerId }),
			checkoutSessionId,
		);
	} catch (error) {
		ctx.logger.error(`Failed to clear checkout session lock: ${error}`);
	}
};

/** Expire the old Stripe Checkout session then clear its reservation. */
const expireAndClearIfOwned = async ({
	ctx,
	customerId,
	checkoutSessionId,
}: {
	ctx: AutumnContext;
	customerId: string;
	checkoutSessionId: string;
}): Promise<void> => {
	try {
		const stripeCli = createStripeCli({
			org: ctx.org,
			env: ctx.env,
		});
		await stripeCli.checkout.sessions.expire(checkoutSessionId);
	} catch (error) {
		ctx.logger.error(
			`Failed to expire checkout session ${checkoutSessionId}: ${error}`,
		);
	}

	await clearIfOwned({ ctx, customerId, checkoutSessionId });
};

export const checkoutSessionLock = {
	get,
	set,
	clearIfOwned,
	expireAndClearIfOwned,
};
export type { CheckoutSessionLockData };
