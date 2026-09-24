import { createCatalogInvalidations } from "./catalog/createCatalogInvalidations.js";
import { sendApplyBillingPlan } from "./commands/sendApplyBillingPlan.js";
import { sendCheck } from "./commands/sendCheck.js";
import { sendConfirmExpiredLock } from "./commands/sendConfirmExpiredLock.js";
import { sendEvict } from "./commands/sendEvict.js";
import { sendFinalize } from "./commands/sendFinalize.js";
import { sendInitialize } from "./commands/sendInitialize.js";
import { sendReadSubjectState } from "./commands/sendReadSubjectState.js";
import { sendReset } from "./commands/sendReset.js";
import { sendTrack } from "./commands/sendTrack.js";
import { createHttpClient } from "./http/createHttpClient.js";
import { createCommandQueue } from "./queue/createCommandQueue.js";
import { enqueueCommands } from "./queue/enqueueCommands.js";
import type { EnqueueParams } from "./queue/types/queue.js";
import type {
	ApplyBillingPlanParams,
	BalanceWorkerClient,
	BalanceWorkerClientConfig,
	BalanceWorkerClientDependencies,
	CheckParams,
	ConfirmExpiredLockParams,
	EvictParams,
	FinalizeParams,
	InitializeParams,
	ReadSubjectStateParams,
	ResetParams,
	TrackParams,
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

	function track(params: TrackParams) {
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

	function finalize(params: FinalizeParams) {
		return sendFinalize({ ctx, ...params });
	}

	function confirmExpiredLock(params: ConfirmExpiredLockParams) {
		return sendConfirmExpiredLock({ ctx, ...params });
	}

	function reset(params: ResetParams) {
		return sendReset({ ctx, ...params });
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
		finalize,
		confirmExpiredLock,
		reset,
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
