import { getMiscRedis } from "@/external/redis/initRedis";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { expireStripeCheckoutSession } from "@/external/stripe/checkoutSessions/operations/expireStripeCheckoutSession.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const FALLBACK_CHECKOUT_LOCK_TTL_SECONDS = 2 * 60;

interface CheckoutSessionLockData {
	paramsHash: string;
	checkoutSessionUrl: string;
	checkoutSessionId: string;
	expiresAt?: number;
	/** Mirror of checkoutSessionId — lets the shared owner-checked clearLock release this reservation. */
	token?: string;
}

const buildCheckoutSessionLockKey = ({
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
	const miscRedis = getMiscRedis();
	const lockKey = buildCheckoutSessionLockKey({ ctx, customerId });

	const value = await tryRedisOp({
		operation: () => miscRedis.get(lockKey),
		source: "checkout-session-lock:get",
		redisInstance: miscRedis,
	});
	if (!value) return null;

	return JSON.parse(value) as CheckoutSessionLockData;
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
	const miscRedis = getMiscRedis();
	const lockKey = buildCheckoutSessionLockKey({ ctx, customerId });
	const ttlSeconds = data.expiresAt
		? Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 1000))
		: FALLBACK_CHECKOUT_LOCK_TTL_SECONDS;

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				lockKey,
				JSON.stringify({ ...data, token: data.checkoutSessionId }),
				"EX",
				ttlSeconds,
			),
		source: "checkout-session-lock:set",
		redisInstance: miscRedis,
	});
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
	await clearLock({
		lockKey: buildCheckoutSessionLockKey({ ctx, customerId }),
		token: checkoutSessionId,
	});
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
	const expired = await expireStripeCheckoutSession({ ctx, checkoutSessionId });
	if (!expired) return false;

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
