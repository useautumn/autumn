import { ms } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const CHECKOUT_LOCK_TTL_SECONDS = ms.minutes(2);

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
	return CacheManager.getJson<CheckoutSessionLockData>(
		buildKey({ ctx, customerId }),
	);
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
	await CacheManager.setJson(
		buildKey({ ctx, customerId }),
		data,
		CHECKOUT_LOCK_TTL_SECONDS,
	);
};

const clear = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<void> => {
	await CacheManager.del(buildKey({ ctx, customerId }));
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
	} catch {
		// Session may already be expired / completed
	}

	await clear({ ctx, customerId });
};

export const checkoutSessionLock = { get, set, clear, expireAndClear };
export type { CheckoutSessionLockData };
