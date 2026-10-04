import type { TrackCommand } from "@autumn/balance-engine";
import { createCatalogInvalidations } from "./catalog/createCatalogInvalidations.js";
import { createCheckLeases } from "./checkLeases/createCheckLeases.js";
import {
	commandIdentityOf,
	commandsIdentitiesOf,
	invalidatesCheckLeases,
	invalidatesOrgCheckLeases,
	requestIdentityOf,
} from "./checkLeases/invalidatesCheckLeases.js";
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
import { createRouteHints } from "./routing/createRouteHints.js";
import { createTrackBatcher } from "./routing/createTrackBatcher.js";
import { createTrackGrants } from "./trackGrants/createTrackGrants.js";
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
		hints: createRouteHints(),
		http,
		partitionCount: config.partitionCount,
		timeoutMs: config.timeoutMs,
		routeRefreshTimeoutMs: config.routeRefreshTimeoutMs,
		...(config.trackGrants ? { trackGrantLane: config.trackGrants.lane } : {}),
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

	function sendTrackToOwner(params: TrackParams) {
		if (trackBatcher) return trackBatcher.track(params);
		return sendTrack({ ctx, ...params });
	}

	// Absent, every track asks the owner and no request names a lane.
	const trackGrants = config.trackGrants
		? createTrackGrants({ config: config.trackGrants })
		: undefined;

	function track(params: TrackParams) {
		if (!trackGrants) return sendTrackToOwner(params);
		function send() {
			return sendTrackToOwner(params);
		}
		function append(command: TrackCommand) {
			return enqueueCommands({
				ctx: queue,
				commands: [command],
				signal: params.signal,
			});
		}
		return trackGrants.answer({ command: params.command, send, append });
	}

	// Absent, every check asks the owner and no write pays for invalidation.
	const checkLeases = config.checkLeases
		? createCheckLeases({ config: config.checkLeases })
		: undefined;

	function check(params: CheckParams) {
		function send() {
			return sendCheck({ ctx, ...params });
		}
		if (!checkLeases) return send();
		return checkLeases.answer({ command: params.command, send });
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

	const commandQueue = createCommandQueue({ ctx: queue });
	const catalog = createCatalogInvalidations({
		ctx: {
			publisher: dependencies.catalogInvalidations,
			timeoutMs: appendTimeoutMs,
		},
	});

	function readCheckLeaseCounters() {
		return checkLeases?.readCounters() ?? null;
	}

	function readTrackGrantCounters() {
		return trackGrants?.readCounters() ?? null;
	}

	async function start(): Promise<void> {
		await dependencies.lifecycle?.start();
	}

	async function stop(): Promise<void> {
		await dependencies.lifecycle?.stop();
	}

	const leases = checkLeases;
	// A write this server sends ends its check leases on the customers it names.
	return {
		track: invalidatesCheckLeases({
			leases,
			send: track,
			identitiesOf: commandIdentityOf,
		}),
		check,
		readSubjectState,
		initialize: invalidatesCheckLeases({
			leases,
			send: initialize,
			identitiesOf: requestIdentityOf,
		}),
		applyBillingPlan: invalidatesCheckLeases({
			leases,
			send: applyBillingPlan,
			identitiesOf: requestIdentityOf,
		}),
		evict: invalidatesCheckLeases({
			leases,
			send: evict,
			identitiesOf: commandIdentityOf,
		}),
		flush,
		finalize: invalidatesCheckLeases({
			leases,
			send: finalize,
			identitiesOf: commandIdentityOf,
		}),
		confirmExpiredLock: invalidatesCheckLeases({
			leases,
			send: confirmExpiredLock,
			identitiesOf: commandIdentityOf,
		}),
		reset: invalidatesCheckLeases({
			leases,
			send: reset,
			identitiesOf: commandIdentityOf,
		}),
		updateBalance: invalidatesCheckLeases({
			leases,
			send: updateBalance,
			identitiesOf: commandIdentityOf,
		}),
		deleteBalance: invalidatesCheckLeases({
			leases,
			send: deleteBalance,
			identitiesOf: commandIdentityOf,
		}),
		recalculateBalance: invalidatesCheckLeases({
			leases,
			send: recalculateBalance,
			identitiesOf: commandIdentityOf,
		}),
		queue: {
			track: invalidatesCheckLeases({
				leases,
				send: commandQueue.track,
				identitiesOf: commandsIdentitiesOf,
			}),
			reset: invalidatesCheckLeases({
				leases,
				send: commandQueue.reset,
				identitiesOf: commandsIdentitiesOf,
			}),
			updateBalance: invalidatesCheckLeases({
				leases,
				send: commandQueue.updateBalance,
				identitiesOf: commandsIdentitiesOf,
			}),
			evict: invalidatesCheckLeases({
				leases,
				send: commandQueue.evict,
				identitiesOf: commandsIdentitiesOf,
			}),
			finalize: invalidatesCheckLeases({
				leases,
				send: commandQueue.finalize,
				identitiesOf: commandsIdentitiesOf,
			}),
		},
		enqueue: invalidatesCheckLeases({
			leases,
			send: enqueue,
			identitiesOf: commandsIdentitiesOf,
		}),
		catalog: {
			invalidateOrgCatalog: invalidatesOrgCheckLeases({
				leases,
				send: catalog.invalidateOrgCatalog,
			}),
		},
		readCheckLeaseCounters,
		readTrackGrantCounters,
		start,
		stop,
	};
}
