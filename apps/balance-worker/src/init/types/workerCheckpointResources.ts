import type { PartitionCheckpointExporter } from "../../checkpoint/partitionCheckpointExporter.js";
import type { PartitionCheckpointSource } from "../../checkpoint/partitionCheckpointSource.js";
import type { PartitionCheckpointMaintenance } from "../../checkpoint/scheduling/partitionCheckpointMaintenance.js";
import type { S3CheckpointThreadConfig } from "../../s3/background/s3CheckpointThreadConfig.js";

export type WorkerCheckpointResources = {
	source: PartitionCheckpointSource;
	maintenance: PartitionCheckpointMaintenance;
	stop(): Promise<void>;
};

export type WorkerCheckpointFactories = {
	createSource(config: S3CheckpointThreadConfig): {
		source: PartitionCheckpointSource;
		close(): void;
	};
	createExporter(
		config: S3CheckpointThreadConfig,
	): PartitionCheckpointExporter & { close(): Promise<void> };
};
