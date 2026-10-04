import type {
	ApplyBillingPlanRequest,
	CheckCommand,
	ConfirmExpiredLockCommand,
	DeleteBalanceCommand,
	EvictCommand,
	FinalizeCommand,
	FlushCommand,
	InitializeRequest,
	MeteringIdentity,
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
import { trackHot as trackHotPartition } from "./commands/trackHot.js";
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
import { createTrackRuns } from "./runs/createTrackRuns.js";
import { createSubjectHydrator } from "./subject/createSubjectHydrator.js";
import { createSubjectDecisions } from "./subject/subjectDecisions/createSubjectDecisions.js";
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
	const subjectDecisions = createSubjectDecisions();
	const writer = createPartitionWriter({
		ctx: {
			stateStore: dependencies.stateStore,
			appender: dependencies.appender,
			receiptPolicy: dependencies.receiptPolicy,
			recentCommands: dependencies.recentCommands,
			positions: dependencies.positions,
			batchedForget: dependencies.batchedForget,
			logger: dependencies.logger,
			onStateAdvanced: (advanced) => {
				subjectHydrator.inheritCatalog(advanced);
				subjectDecisions.advance(advanced);
			},
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
			logger: dependencies.logger,
		},
	});
	const scope: PartitionProcessorScope = {
		ctx: {
			...dependencies,
			config,
			writer,
			subjectHydrator,
			subjectDecisions,
		},
		accepted: createAcceptedCommands(),
		customerPlans: createCustomerPlans(),
	};
	if (config.decidesTrackRuns !== false)
		scope.trackRuns = createTrackRuns({ scope });

	return createProcessor({ scope });
}

function createProcessor({
	scope,
}: {
	scope: PartitionProcessorScope;
}): PartitionProcessor {
	/** Anything but a track waits for the tracks queued before it for the customer, as it would have decided after them. */
	function inTurn<Result>({
		identity,
		run,
	}: {
		identity: MeteringIdentity;
		run: () => Promise<Result>;
	}): Promise<Result> {
		const turn = scope.trackRuns?.whenDecided({ identity });
		return turn ? turn.then(run) : run();
	}

	function track({ command }: { command: TrackCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: trackPartition({ scope, command }),
		});
	}

	function trackHot({ command }: { command: TrackCommand }) {
		return trackHotPartition({ scope, command });
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
			operation: inTurn({
				identity: command.identity,
				run: () => checkPartition({ scope, command }),
			}),
		});
	}

	function readSubjectState({ command }: { command: ReadSubjectStateCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => readSubjectStatePartition({ scope, command }),
			}),
		});
	}

	function applyBillingPlan({ request }: { request: ApplyBillingPlanRequest }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: request.command.identity,
				run: () => applyBillingPlanPartition({ scope, request }),
			}),
		});
	}

	function evict({ command }: { command: EvictCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => evictPartition({ scope, command }),
			}),
		});
	}

	function flush({ command }: { command: FlushCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => flushPartition({ scope, command }),
			}),
		});
	}

	function finalize({ command }: { command: FinalizeCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => finalizePartition({ scope, command }),
			}),
		});
	}

	function decideFinalize({ command }: { command: FinalizeCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => decideFinalizePartition({ scope, command }),
			}),
		});
	}

	function confirmExpiredLock({
		command,
	}: {
		command: ConfirmExpiredLockCommand;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => confirmExpiredLockPartition({ scope, command }),
			}),
		});
	}

	function reset({ command }: { command: ResetCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => resetPartition({ scope, command }),
			}),
		});
	}

	function decideReset({ command }: { command: ResetCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => decideResetPartition({ scope, command }),
			}),
		});
	}

	/** Commands settle when Kafka has them, but the store applies behind the log:
	 *  a "log" reply lands before its store apply, so a drained partition waits for
	 *  the current store completion and for every batch handed to the store before it lets go. */
	function updateBalance({ command }: { command: UpdateBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => updateBalancePartition({ scope, command }),
			}),
		});
	}

	function decideUpdateBalance({ command }: { command: UpdateBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => decideUpdateBalancePartition({ scope, command }),
			}),
		});
	}

	function deleteBalance({ command }: { command: DeleteBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => deleteBalancePartition({ scope, command }),
			}),
		});
	}

	function recalculateBalance({
		command,
	}: {
		command: RecalculateBalanceCommand;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: inTurn({
				identity: command.identity,
				run: () => recalculateBalancePartition({ scope, command }),
			}),
		});
	}

	async function drain() {
		await settleAcceptedCommands({ accepted: scope.accepted });
		await scope.ctx.writer.flushDeferredLogs();
		scope.ctx.writer.hurryStore();
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
			operation: inTurn({
				identity: request.command.identity,
				run: () => initializePartition({ scope, request }),
			}),
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
		dispose: () => scope.ctx.writer.dispose(),
		readCounters: () => ({
			...scope.ctx.subjectDecisions.readCounters(),
			...(scope.trackRuns?.readCounters() ?? {
				trackRuns: 0,
				trackRunTracks: 0,
				trackRunMax: 0,
			}),
		}),
		track,
		trackHot,
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
