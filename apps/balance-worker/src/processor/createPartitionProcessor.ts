import type {
	CheckCommand,
	ConfirmExpiredLockCommand,
	EvictCommand,
	FinalizeCommand,
	InitializeRequest,
	MutationSource,
	TrackCommand,
} from "@autumn/balance-engine";
import { check as checkPartition } from "./commands/check.js";
import { confirmExpiredLock as confirmExpiredLockPartition } from "./commands/confirmExpiredLock.js";
import { evict as evictPartition } from "./commands/evict.js";
import { finalize as finalizePartition } from "./commands/finalize.js";
import { initialize as initializePartition } from "./commands/initialize.js";
import { track as trackPartition } from "./commands/track.js";
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
		},
	});
	const scope: PartitionProcessorScope = {
		ctx: { ...dependencies, config, writer, subjectHydrator },
		accepted: createAcceptedCommands(),
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

	function evict({ command }: { command: EvictCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: evictPartition({ scope, command }),
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

	function drain() {
		return settleAcceptedCommands({ accepted: scope.accepted });
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
		initialize,
		evict,
		finalize,
		confirmExpiredLock,
		drain,
	};
}
