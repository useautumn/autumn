import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const CHECKOUT_LOCK_TTL_SECONDS = 2 * 60;

interface CheckoutSessionLockData {
	paramsHash: string;
	checkoutSessionUrl: string;
	checkoutSessionId: string;
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
		await CacheManager.setJson(
			buildKey({ ctx, customerId }),
			data,
			CHECKOUT_LOCK_TTL_SECONDS,
		);
	} catch (error) {
		ctx.logger.error(`Failed to set checkout session lock: ${error}`);
	}
};

const clear = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<void> => {
	try {
		await CacheManager.del(buildKey({ ctx, customerId }));
	} catch (error) {
		ctx.logger.error(`Failed to clear checkout session lock: ${error}`);
	}
};

/** Expire the old Stripe Checkout session then delete the Redis lock. */
const expireAndClear = async ({
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

	await clear({ ctx, customerId });
};

export const checkoutSessionLock = { get, set, clear, expireAndClear };
export type { CheckoutSessionLockData };
