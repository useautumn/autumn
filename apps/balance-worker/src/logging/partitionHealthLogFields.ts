import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";

export function partitionHealthLogFields({
	health,
}: {
	health: OwnedPartitionHealth;
}) {
	return {
		topic: health.topic,
		partition: health.partition,
		status: health.status,
		localNextOffset: health.localNextOffset?.toString() ?? null,
		consumedNextOffset: health.consumedNextOffset?.toString() ?? null,
		highWatermark: health.highWatermark?.toString() ?? null,
		lag: health.lag?.toString() ?? null,
		failureReason: health.failureReason,
		commands: health.commands
			? {
					consumedNextOffset:
						health.commands.consumedNextOffset?.toString() ?? null,
					highWatermark: health.commands.highWatermark?.toString() ?? null,
					lag: health.commands.lag?.toString() ?? null,
				}
			: null,
		checkpoint: health.checkpoint
			? {
					...health.checkpoint,
					lastConfirmedNextOffset:
						health.checkpoint.lastConfirmedNextOffset?.toString() ?? null,
				}
			: null,
	};
}
