import type { PartitionCheckpointLimits } from "../../checkpoint/partitionCheckpointLimits.js";
import type { S3PartitionCheckpointStorageLimits } from "../s3PartitionCheckpointStorage.js";

export type S3CheckpointThreadConfig = {
	databasePath: string;
	checkpointLimits: PartitionCheckpointLimits;
	storage: {
		bucket: string;
		keyPrefix: string;
		deploymentEnvironment: string;
		limits: S3PartitionCheckpointStorageLimits;
	};
	client: {
		region: string;
		endpoint?: string;
		forcePathStyle?: boolean;
		credentials?: {
			accessKeyId: string;
			secretAccessKey: string;
			sessionToken?: string;
		};
	};
};
