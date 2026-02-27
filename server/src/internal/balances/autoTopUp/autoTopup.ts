import {
	ACTIVE_STATUSES,
	cusEntsToCurrentBalance,
	cusEntToCusPrice,
	fullCustomerToCustomerEntitlements,
	isOneOffPrice,
	isPrepaidPrice,
} from "@autumn/shared";
import { acquireLock, clearLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import { checkAutoTopUpRateLimit } from "./autoTopUpRateLimit.js";
import { buildAutoTopUpLockKey } from "./autoTopUpUtils.js";
import { executeAutoTopUp } from "./executeAutoTopUp.js";

/** Workflow handler for auto top-ups. Re-fetches fresh data and re-validates all conditions. */
export const autoTopup = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopUpPayload;
}) => {
	const { org, env, logger } = ctx;
	const { customerId, featureId } = payload;

	// 1. Fetch FullCustomer — try Redis cache first (has latest balance), fall back to DB
	let fullCustomer = await getCachedFullCustomer({ ctx, customerId });

	if (!fullCustomer) {
		fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ACTIVE_STATUSES,
			withSubs: true,
		});
	}

	if (!fullCustomer) {
		logger.warn(`[autoTopup] Customer ${customerId} not found, skipping`);
		return;
	}

	// 2. Find matching auto_topup config for this feature
	const autoTopupConfig = fullCustomer.auto_topup?.find(
		(config) => config.feature_id === featureId && config.enabled,
	);

	if (!autoTopupConfig) {
		return;
	}

	// 3. Find customer entitlements for this feature
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) {
		return;
	}

	// 4. Find the cusEnt linked to the one-off prepaid price
	const cusEntWithPrice = cusEnts.find((ce) => {
		const cp = cusEntToCusPrice({ cusEnt: ce });
		return cp && isOneOffPrice(cp.price) && isPrepaidPrice(cp.price);
	});

	if (!cusEntWithPrice) {
		logger.warn(
			`[autoTopup] No cusEnt with one-off prepaid price for feature ${featureId}, skipping`,
		);
		return;
	}

	const cusPrice = cusEntToCusPrice({ cusEnt: cusEntWithPrice })!;

	// 5. Re-check balance against threshold (critical: handles queued duplicates)
	const remainingBalance = cusEntsToCurrentBalance({ cusEnts });

	if (remainingBalance >= autoTopupConfig.threshold) {
		logger.info(
			`[autoTopup] Balance ${remainingBalance} is above threshold ${autoTopupConfig.threshold} for feature ${featureId}, skipping (likely already topped up)`,
		);
		return;
	}

	// 6. Check purchase_limit rate limit
	if (autoTopupConfig.purchase_limit) {
		const allowed = await checkAutoTopUpRateLimit({
			orgId: org.id,
			env,
			customerId,
			featureId,
			purchaseLimit: autoTopupConfig.purchase_limit,
		});

		if (!allowed) {
			logger.info(
				`[autoTopup] Purchase limit reached for feature ${featureId}, customer ${customerId}`,
			);
			return;
		}
	}

	// 7. Acquire lock to prevent duplicate top-ups
	const lockKey = buildAutoTopUpLockKey({
		orgId: org.id,
		env,
		customerId,
		featureId,
	});

	await acquireLock({
		lockKey,
		ttlMs: 60000,
		errorMessage: `Auto top-up already in progress for feature ${featureId}`,
	});

	// 8. Execute under the lock
	try {
		const start = performance.now();
		await executeAutoTopUp({
			ctx,
			fullCustomer,
			autoTopupConfig,
			cusEnts,
			cusPrice,
		});
		const durationMs = Math.round(performance.now() - start);
		logger.info(
			`[autoTopup] Completed for feature ${featureId}, customer ${customerId}, duration: ${durationMs}ms`,
		);
	} finally {
		await clearLock({ lockKey });
	}
};
