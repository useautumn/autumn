import type {
	CheckCommand,
	InitializeCommand,
	TrackCommand,
} from "@autumn/balance-engine";
import { check as checkPartition } from "./commands/check.js";
import { initialize as initializePartition } from "./commands/initialize.js";
import { track as trackPartition } from "./commands/track.js";
import {
	acceptCommand,
	createAcceptedCommands,
	settleAcceptedCommands,
} from "./common/acceptedCommands.js";
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
		},
	});
	const scope: PartitionProcessorScope = {
		ctx: { ...dependencies, config, writer, subjectHydrator },
		accepted: createAcceptedCommands(),
	};

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

	function drain() {
		return settleAcceptedCommands({ accepted: scope.accepted });
	}

	function initialize({ command }: { command: InitializeCommand }) {
		return acceptCommand({
			accepted: scope.accepted,
			operation: initializePartition({ scope, command }),
		});
	}

	return { track, check, initialize, drain };
}
