import { createCatalogInvalidations } from "./catalog/createCatalogInvalidations.js";
import { sendApplyBillingPlan } from "./commands/sendApplyBillingPlan.js";
import { sendCheck } from "./commands/sendCheck.js";
import { sendConfirmExpiredLock } from "./commands/sendConfirmExpiredLock.js";
import { sendDeleteBalance } from "./commands/sendDeleteBalance.js";
import { sendEvict } from "./commands/sendEvict.js";
import { sendFinalize } from "./commands/sendFinalize.js";
import { sendFlush } from "./commands/sendFlush.js";
import { sendInitialize } from "./commands/sendInitialize.js";
import { sendReadSubjectState } from "./commands/sendReadSubjectState.js";
import { sendRecalculateBalance } from "./commands/sendRecalculateBalance.js";
import { sendReset } from "./commands/sendReset.js";
import { sendTrack } from "./commands/sendTrack.js";
import { sendUpdateBalance } from "./commands/sendUpdateBalance.js";
import { createHttpClient } from "./http/createHttpClient.js";
import { createCommandQueue } from "./queue/createCommandQueue.js";
import { enqueueCommands } from "./queue/enqueueCommands.js";
import type { EnqueueParams } from "./queue/types/queue.js";
import { createTrackBatcher } from "./routing/createTrackBatcher.js";
import type {
	ApplyBillingPlanParams,
	BalanceWorkerClient,
	BalanceWorkerClientConfig,
	BalanceWorkerClientDependencies,
	CheckParams,
	ConfirmExpiredLockParams,
	DeleteBalanceParams,
	EvictParams,
	FinalizeParams,
	FlushParams,
	InitializeParams,
	ReadSubjectStateParams,
	RecalculateBalanceParams,
	ResetParams,
	TrackParams,
	UpdateBalanceParams,
} from "./types/balanceWorkerClient.js";

/** An append's default budget: a first append may include the producer connect, and no customer request waits on it. */
const DEFAULT_APPEND_TIMEOUT_MS = 3_000;

export function createBalanceWorkerClient({
	ctx: dependencies,
	config,
}: {
	ctx: BalanceWorkerClientDependencies;
	config: BalanceWorkerClientConfig;
}): BalanceWorkerClient {
	const http =
		dependencies.http ??
		createHttpClient({
			config: { maxResponseBytes: config.maxResponseBytes ?? 1_048_576 },
		});

	const ctx = {
		owners: dependencies.owners,
		http,
		partitionCount: config.partitionCount,
		timeoutMs: config.timeoutMs,
		routeRefreshTimeoutMs: config.routeRefreshTimeoutMs,
	};
	const appendTimeoutMs = config.appendTimeoutMs ?? DEFAULT_APPEND_TIMEOUT_MS;
	const queue = {
		commandLog: dependencies.commandLog,
		partitionCount: config.partitionCount,
		timeoutMs: appendTimeoutMs,
	};

	// Batching is the default; turning it off falls back to one `/v1/track` request per track.
	const trackBatcher =
		config.batchTracks === false
			? undefined
			: createTrackBatcher({ ctx, maxBatchSize: config.maxTrackBatchSize });

	function track(params: TrackParams) {
		if (trackBatcher) return trackBatcher.track(params);
		return sendTrack({ ctx, ...params });
	}

	function check(params: CheckParams) {
		return sendCheck({ ctx, ...params });
	}

	function readSubjectState(params: ReadSubjectStateParams) {
		return sendReadSubjectState({ ctx, ...params });
	}

	function applyBillingPlan(params: ApplyBillingPlanParams) {
		return sendApplyBillingPlan({ ctx, ...params });
	}

	function initialize(params: InitializeParams) {
		return sendInitialize({ ctx, ...params });
	}

	function evict(params: EvictParams) {
		return sendEvict({ ctx, ...params });
	}

	function flush(params: FlushParams) {
		return sendFlush({ ctx, ...params });
	}

	function finalize(params: FinalizeParams) {
		return sendFinalize({ ctx, ...params });
	}

	function confirmExpiredLock(params: ConfirmExpiredLockParams) {
		return sendConfirmExpiredLock({ ctx, ...params });
	}

	function reset(params: ResetParams) {
		return sendReset({ ctx, ...params });
	}

	function updateBalance(params: UpdateBalanceParams) {
		return sendUpdateBalance({ ctx, ...params });
	}

	function deleteBalance(params: DeleteBalanceParams) {
		return sendDeleteBalance({ ctx, ...params });
	}

	function recalculateBalance(params: RecalculateBalanceParams) {
		return sendRecalculateBalance({ ctx, ...params });
	}

	function enqueue(params: EnqueueParams) {
		return enqueueCommands({ ctx: queue, ...params });
	}

	async function start(): Promise<void> {
		await dependencies.lifecycle?.start();
	}

	async function stop(): Promise<void> {
		await dependencies.lifecycle?.stop();
	}

	return {
		track,
		check,
		readSubjectState,
		initialize,
		applyBillingPlan,
		evict,
		flush,
		finalize,
		confirmExpiredLock,
		reset,
		updateBalance,
		deleteBalance,
		recalculateBalance,
		queue: createCommandQueue({ ctx: queue }),
		enqueue,
		catalog: createCatalogInvalidations({
			ctx: {
				publisher: dependencies.catalogInvalidations,
				timeoutMs: appendTimeoutMs,
			},
		}),
		start,
		stop,
	};
}
