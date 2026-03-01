import {
	ACTIVE_STATUSES,
	cusEntsToCurrentBalance,
	cusEntToCusPrice,
	fullCustomerToCustomerEntitlements,
	isOneOffPrice,
	isPrepaidPrice,
	RecaseError,
} from "@autumn/shared";
import { acquireLock, clearLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import { checkAutoTopUpRateLimit } from "./autoTopUpRateLimit.js";
import { executeAutoTopUp } from "./executeAutoTopUp.js";

/** SQS job handler for auto top-ups. Re-fetches fresh data and re-validates all conditions. */
export const handleAutoTopUpJob = async ({
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
		logger.warn(
			`[handleAutoTopUpJob] Customer ${customerId} not found, skipping`,
		);
		return;
	}

	// 2. Find matching auto_topup config for this feature
	const autoTopupConfig = fullCustomer.auto_topup?.find(
		(config) => config.feature_id === featureId && config.enabled,
	);

	if (!autoTopupConfig) {
		return;
	}

	// 3. Find customer entitlements for this feature + validate one-off prepaid price
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	if (cusEnts.length === 0) {
		return;
	}

	const cusPrice = cusEntToCusPrice({ cusEnt: cusEnts[0] });

	if (!cusPrice) {
		logger.warn(`[handleAutoTopUpJob] No price found for feature ${featureId}`);
		return;
	}

	if (!isOneOffPrice(cusPrice.price)) {
		logger.warn(
			`[handleAutoTopUpJob] Price for feature ${featureId} is not one-off, skipping`,
		);
		return;
	}

	if (!isPrepaidPrice(cusPrice.price)) {
		logger.warn(
			`[handleAutoTopUpJob] Price for feature ${featureId} is not prepaid, skipping`,
		);
		return;
	}

	// 4. Re-check balance against threshold (critical: handles queued duplicates)
	const remainingBalance = cusEntsToCurrentBalance({ cusEnts });

	if (remainingBalance >= autoTopupConfig.threshold) {
		logger.info(
			`[handleAutoTopUpJob] Balance ${remainingBalance} is above threshold ${autoTopupConfig.threshold} for feature ${featureId}, skipping (likely already topped up)`,
		);
		return;
	}

	// 5. Check max_purchases rate limit
	if (autoTopupConfig.max_purchases) {
		const allowed = await checkAutoTopUpRateLimit({
			orgId: org.id,
			env,
			customerId,
			featureId,
			maxPurchases: autoTopupConfig.max_purchases,
		});

		if (!allowed) {
			logger.info(
				`[handleAutoTopUpJob] Max purchases rate limit reached for feature ${featureId}, customer ${customerId}`,
			);
			return;
		}
	}

	// 6. Acquire lock to prevent duplicate top-ups
	const lockKey = `auto_topup:${org.id}:${env}:${customerId}:${featureId}`;

	try {
		await acquireLock({
			lockKey,
			ttlMs: 60000,
			errorMessage: `Auto top-up already in progress for feature ${featureId}`,
		});
	} catch (error) {
		if (error instanceof RecaseError && error.statusCode === 429) {
			logger.info(
				`[handleAutoTopUpJob] Lock already held for feature ${featureId}, customer ${customerId}`,
			);
			return;
		}
		throw error;
	}

	// 7. Execute under the lock
	try {
		const feature = ctx.features.find((f) => f.id === featureId);

		if (!feature) {
			logger.warn(
				`[handleAutoTopUpJob] Feature ${featureId} not found in org features, skipping`,
			);
			return;
		}

		const start = performance.now();
		await executeAutoTopUp({
			ctx,
			fullCustomer,
			feature,
			autoTopupConfig,
			cusEnts,
			cusPrice,
		});
		const durationMs = Math.round(performance.now() - start);
		logger.info(
			`[handleAutoTopUpJob] Completed for feature ${featureId}, customer ${customerId}, duration: ${durationMs}ms`,
		);
	} finally {
		await clearLock({ lockKey });
	}
};
