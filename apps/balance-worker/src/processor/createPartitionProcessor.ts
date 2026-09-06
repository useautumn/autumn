import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import { check as checkPartition } from "./commands/check.js";
import { track as trackPartition } from "./commands/track.js";
import {
	acceptCommand,
	createAcceptedCommands,
	settleAcceptedCommands,
} from "./common/acceptedCommands.js";
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
	const scope: PartitionProcessorScope = {
		ctx: {
			...dependencies,
			config,
			writer: createPartitionWriter({
				ctx: {
					stateStore: dependencies.stateStore,
					appender: dependencies.appender,
				},
				config: {
					topic: config.topic,
					partition: config.partition,
					limits: config.writerLimits,
				},
			}),
		},
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

	return { track, check, drain };
}
