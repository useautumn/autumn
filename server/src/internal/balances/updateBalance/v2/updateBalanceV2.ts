import {
	ErrCode,
	RecaseError,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isAsyncBalanceUpdateEnabled } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getUpdateBalanceProducerQueueUrl } from "@/queue/trackAsyncQueueUrls.js";
import { runBalanceWorkerAsyncUpdateBalance } from "../balanceWorker/runBalanceWorkerAsyncUpdateBalance.js";
import { runBalanceWorkerUpdateBalance } from "../balanceWorker/runBalanceWorkerUpdateBalance.js";
import { updateBalanceOnCacheV2 } from "./updateBalanceOnCacheV2.js";

const ASYNC_UPDATE_BALANCE_UNAVAILABLE_MESSAGE =
	"Async balance update is not available right now";

/** One job per request, grouped per subject so updates apply in order; the consumer runs `runUpdateBalanceV2`. */
const queueUpdateBalanceV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	const queueUrl = getUpdateBalanceProducerQueueUrl();
	if (!queueUrl) {
		throw new RecaseError({
			message: ASYNC_UPDATE_BALANCE_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}

	try {
		await addTaskToQueue({
			jobName: JobName.UpdateBalance,
			queueUrl,
			messageGroupId: `${ctx.org.id}:${ctx.env}:${params.customer_id}:${params.entity_id ?? "none"}`,
			messageDeduplicationId: ctx.id,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: params.customer_id,
				entityId: params.entity_id,
				requestId: ctx.id,
				params,
				targetBalance,
			},
		});
		// The worker owns invalidation; route refresh could flush pre-job cache state.
		ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	} catch (error) {
		ctx.logger.error("[updateBalanceV2] Failed to enqueue async update", {
			error,
		});
		throw new RecaseError({
			message: ASYNC_UPDATE_BALANCE_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}
};

/** The sync gate between the worker and the legacy cache path; the SQS consumer runs it for jobs queued on the legacy path. */
export const runUpdateBalanceV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}): Promise<void> => {
	if (isBalanceWorkerRolloutEnabled({ ctx, customerId: params.customer_id })) {
		await runBalanceWorkerUpdateBalance({ ctx, params, targetBalance });
		return;
	}
	await updateBalanceOnCacheV2({ ctx, params, targetBalance });
};

/** `balances.update`: queued for orgs on async updates, run now for everyone else. */
export const updateBalanceV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	const asyncBalanceUpdateEnabled =
		isAsyncBalanceUpdateEnabled({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		}) ||
		(process.env.NODE_ENV !== "production" &&
			ctx.testOptions?.asyncBalanceUpdate);

	// On the worker path an async update is a queued command, as an async track is; SQS stays the legacy queue.
	if (
		asyncBalanceUpdateEnabled &&
		isBalanceWorkerRolloutEnabled({ ctx, customerId: params.customer_id })
	) {
		return runBalanceWorkerAsyncUpdateBalance({ ctx, params, targetBalance });
	}
	if (asyncBalanceUpdateEnabled) {
		return queueUpdateBalanceV2({ ctx, params, targetBalance });
	}
	return runUpdateBalanceV2({ ctx, params, targetBalance });
};
