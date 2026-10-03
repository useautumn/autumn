import type {
	ApplyBillingPlanRequest,
	CheckCommand,
	ConfirmExpiredLockCommand,
	DeleteBalanceCommand,
	EvictCommand,
	FinalizeCommand,
	FlushCommand,
	InitializeRequest,
	MutationSource,
	ReadSubjectStateCommand,
	RecalculateBalanceCommand,
	ResetCommand,
	TrackCommand,
	UpdateBalanceCommand,
} from "@autumn/balance-engine";
import { applyBillingPlan as applyBillingPlanPartition } from "./commands/applyBillingPlan/applyBillingPlan.js";
import { createCustomerPlans } from "./commands/applyBillingPlan/customerPlans/customerPlans.js";
import { check as checkPartition } from "./commands/check.js";
import { confirmExpiredLock as confirmExpiredLockPartition } from "./commands/confirmExpiredLock.js";
import { deleteBalance as deleteBalancePartition } from "./commands/deleteBalance.js";
import { evict as evictPartition } from "./commands/evict.js";
import {
	decideFinalize as decideFinalizePartition,
	finalize as finalizePartition,
} from "./commands/finalize.js";
import { flush as flushPartition } from "./commands/flush.js";
import { initialize as initializePartition } from "./commands/initialize.js";
import { readSubjectState as readSubjectStatePartition } from "./commands/readSubjectState.js";
import { recalculateBalance as recalculateBalancePartition } from "./commands/recalculateBalance.js";
import {
	decideReset as decideResetPartition,
	reset as resetPartition,
} from "./commands/reset.js";
import {
	decideTrack as decideTrackPartition,
	track as trackPartition,
} from "./commands/track.js";
import {
	decideUpdateBalance as decideUpdateBalancePartition,
	updateBalance as updateBalancePartition,
} from "./commands/updateBalance.js";
import {
	acceptCommand,
	createAcceptedCommands,
	settleAcceptedCommands,
} from "./common/acceptedCommands.js";
import { executeCommand } from "./execution/executeCommand.js";
import { createSubjectHydrator } from "./subject/createSubjectHydrator.js";
import type { DeferredLogSink } from "./types/deferredLogSink.js";
import type {
	PartitionProcessor,
	PartitionProcessorConfig,
	PartitionProcessorDependencies,
	PartitionProcessorScope,
} from "./types/partitionProcessor.js";
import { createPartitionWriter } from "./writer/createPartitionWriter.js";

export function createPartitionProcessor({
	ctx: dependencies,
	config,
}: {
	ctx: PartitionProcessorDependencies;
	config: PartitionProcessorConfig;
}): PartitionProcessor {
	const writer = createPartitionWriter({
		ctx: {
			stateStore: dependencies.stateStore,
			appender: dependencies.appender,
			subjectSnapshotsConfig: dependencies.subjectSnapshotsConfig,
			receiptPolicy: dependencies.receiptPolicy,
			recentCommands: dependencies.recentCommands,
			onStateAdvanced: (advanced) => subjectHydrator.inheritCatalog(advanced),
		},
		config: {
			topic: config.topic,
			partition: config.partition,
			limits: config.writerLimits,
		},
	});
	const subjectHydrator = createSubjectHydrator({
		ctx: {
			catalogCache: dependencies.catalogCache,
			db: dependencies.db,
			writer,
			receiptPolicy: dependencies.receiptPolicy,
			baseline: dependencies.stateStore.baseline,
			subjectSnapshotsConfig: dependencies.subjectSnapshotsConfig,
			snapshotQueues: dependencies.stateStore.snapshotQueues,
			position: { topic: config.topic, partition: config.partition },
			readNextOffset: (position) =>
				dependencies.stateStore.readNextOffset(position),
			logger: dependencies.logger,
		},
	});
	const scope: PartitionProcessorScope = {
		ctx: { ...dependencies, config, writer, subjectHydrator },
		accepted: createAcceptedCommands(),
		customerPlans: createCustomerPlans(),
	};

	return createProcessor({ scope });
}

function createProcessor({
	scope,
}: {
	scope: PartitionProcessorScope;
}): PartitionProcessor {
	function track({ command }: { command: TrackCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: trackPartition({ scope, command }),
		});
	}

	function decideTrack({ command }: { command: TrackCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: decideTrackPartition({ scope, command }),
		});
	}

	function check({ command }: { command: CheckCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: checkPartition({ scope, command }),
		});
	}

	function readSubjectState({ command }: { command: ReadSubjectStateCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: readSubjectStatePartition({ scope, command }),
		});
	}

	function applyBillingPlan({ request }: { request: ApplyBillingPlanRequest }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: applyBillingPlanPartition({ scope, request }),
		});
	}

	function evict({
		command,
		waitsForSnapshotDelete = true,
	}: {
		command: EvictCommand;
		waitsForSnapshotDelete?: boolean;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: evictPartition({ scope, command, waitsForSnapshotDelete }),
		});
	}

	function flush({ command }: { command: FlushCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: flushPartition({ scope, command }),
		});
	}

	function finalize({ command }: { command: FinalizeCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: finalizePartition({ scope, command }),
		});
	}

	function decideFinalize({ command }: { command: FinalizeCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: decideFinalizePartition({ scope, command }),
		});
	}

	function confirmExpiredLock({
		command,
	}: {
		command: ConfirmExpiredLockCommand;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: confirmExpiredLockPartition({ scope, command }),
		});
	}

	function reset({ command }: { command: ResetCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: resetPartition({ scope, command }),
		});
	}

	function decideReset({ command }: { command: ResetCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: decideResetPartition({ scope, command }),
		});
	}

	/** Commands settle when Kafka has them, but the store applies behind the log:
	 *  a "log" reply lands before its store apply, so a drained partition waits for
	 *  the current store completion and for every batch handed to the store before it lets go. */
	function updateBalance({ command }: { command: UpdateBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: updateBalancePartition({ scope, command }),
		});
	}

	function decideUpdateBalance({ command }: { command: UpdateBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: decideUpdateBalancePartition({ scope, command }),
		});
	}

	function deleteBalance({ command }: { command: DeleteBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: deleteBalancePartition({ scope, command }),
		});
	}

	function recalculateBalance({
		command,
	}: {
		command: RecalculateBalanceCommand;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: recalculateBalancePartition({ scope, command }),
		});
	}

	async function drain() {
		await settleAcceptedCommands({ accepted: scope.accepted });
		await scope.ctx.writer.flushDeferredLogs();
		// A "log" reply lands before its store apply; a successor must find every apply
		// finished, and a store that refused one must fail the drain, not be swallowed.
		await scope.ctx.writer.waitForApplies();
		await scope.ctx.writer.waitForStore();
		await landCommandOffsets();
	}

	/** Best effort: the successor resumes from the Postgres bookmark, so an offset
	 *  that did not land costs it a skip forward, never a second decision. */
	async function landCommandOffsets(): Promise<void> {
		try {
			await scope.ctx.appender.flushCommandOffsets?.();
		} catch (cause) {
			scope.ctx.logger?.warn?.(
				"Command offsets did not land before the drain; the successor resumes from Postgres",
				{
					topic: scope.ctx.config.topic,
					partition: scope.ctx.config.partition,
					error: cause,
				},
			);
		}
	}

	function initialize({ request }: { request: InitializeRequest }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: initializePartition({ scope, request }),
		});
	}

	function execute<Decision>({
		source,
		run,
		deferredLogs,
	}: {
		source: MutationSource;
		run: (processor: PartitionProcessor) => Promise<Decision>;
		deferredLogs?: DeferredLogSink;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: executeCommand({
				scope,
				source,
				deferredLogs,
				run: (executionScope) =>
					run(createProcessor({ scope: executionScope })),
			}),
		});
	}

	return {
		execute,
		dispose: () => {
			scope.ctx.subjectHydrator.dispose();
			scope.ctx.writer.dispose();
		},
		track,
		decideTrack,
		check,
		applyBillingPlan,
		readSubjectState,
		initialize,
		evict,
		flush,
		finalize,
		decideFinalize,
		confirmExpiredLock,
		reset,
		decideReset,
		updateBalance,
		decideUpdateBalance,
		deleteBalance,
		recalculateBalance,
		drain,
	};
}
