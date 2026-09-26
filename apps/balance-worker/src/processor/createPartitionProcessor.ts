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
import { finalize as finalizePartition } from "./commands/finalize.js";
import { flush as flushPartition } from "./commands/flush.js";
import { initialize as initializePartition } from "./commands/initialize.js";
import { readSubjectState as readSubjectStatePartition } from "./commands/readSubjectState.js";
import { recalculateBalance as recalculateBalancePartition } from "./commands/recalculateBalance.js";
import { reset as resetPartition } from "./commands/reset.js";
import { track as trackPartition } from "./commands/track.js";
import { updateBalance as updateBalancePartition } from "./commands/updateBalance.js";
import {
	acceptCommand,
	createAcceptedCommands,
	settleAcceptedCommands,
} from "./common/acceptedCommands.js";
import { executeCommand } from "./execution/executeCommand.js";
import { createSubjectHydrator } from "./subject/createSubjectHydrator.js";
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

	function evict({ command }: { command: EvictCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: evictPartition({ scope, command }),
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

	/** Commands settle when Kafka has them, but the store applies behind the log:
	 *  a "log" reply lands before its store apply, so a drained partition waits for
	 *  the current store completion and for every batch handed to the store before it lets go. */
	function updateBalance({ command }: { command: UpdateBalanceCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: updateBalancePartition({ scope, command }),
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
		// A "log" reply lands before its store apply; a successor must find every apply
		// finished, and a store that refused one must fail the drain, not be swallowed.
		await scope.ctx.writer.waitForApplies();
		await scope.ctx.writer.waitForStore();
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
	}: {
		source: MutationSource;
		run: (processor: PartitionProcessor) => Promise<Decision>;
	}) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: executeCommand({
				scope,
				source,
				run: (executionScope) =>
					run(createProcessor({ scope: executionScope })),
			}),
		});
	}

	return {
		execute,
		track,
		check,
		applyBillingPlan,
		readSubjectState,
		initialize,
		evict,
		flush,
		finalize,
		confirmExpiredLock,
		reset,
		updateBalance,
		deleteBalance,
		recalculateBalance,
		drain,
	};
}
