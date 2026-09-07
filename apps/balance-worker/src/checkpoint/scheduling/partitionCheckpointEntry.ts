import type {
	PartitionCheckpointFailure,
	PartitionCheckpointHealth,
} from "../../health/partitionCheckpointHealth.js";
import { PartitionCheckpointThreadError } from "../background/checkpointThreadFailure.js";
import { PartitionCheckpointBodyLimitExceededError } from "../partitionCheckpointEncoding.js";
import { PartitionCheckpointLimitExceededError } from "../partitionCheckpointLimits.js";
import { PartitionCheckpointPublisherError } from "../partitionCheckpointPublisher.js";
import type { PartitionCheckpointMaintenance } from "./partitionCheckpointMaintenance.js";
import type { PartitionCheckpointScheduleEntry } from "./partitionCheckpointSchedule.js";

export type PartitionCheckpointEntry = Parameters<
	PartitionCheckpointMaintenance["start"]
>[0] &
	Omit<
		PartitionCheckpointScheduleEntry,
		"dirtySince" | "lastConfirmedNextOffset"
	> & {
		health: PartitionCheckpointHealth;
		consumedNextOffset: bigint | null;
		nextCleanupAt: number;
		attempt: number;
		inFlightNextOffset: bigint | null;
		changesDuringExportSince: number | null;
		abortExport: (() => void) | null;
		removeAbortListener(): void;
	};

export class PartitionCheckpointExportTimeoutError extends Error {
	constructor({ timeoutMs }: { timeoutMs: number }) {
		super(`Partition checkpoint export exceeded ${timeoutMs}ms`);
		this.name = "PartitionCheckpointExportTimeoutError";
	}
}

export const checkpointFailureOf = ({
	cause,
}: {
	cause: unknown;
}): PartitionCheckpointFailure => {
	const failure: PartitionCheckpointFailure = {
		name: cause instanceof Error ? cause.name : "UnknownCheckpointFailure",
		message: cause instanceof Error ? cause.message : String(cause),
		retriable:
			cause instanceof PartitionCheckpointPublisherError
				? cause.retriable
				: cause instanceof PartitionCheckpointExportTimeoutError ||
					cause instanceof PartitionCheckpointThreadError,
	};
	if (
		cause instanceof PartitionCheckpointLimitExceededError ||
		cause instanceof PartitionCheckpointBodyLimitExceededError
	) {
		return {
			...failure,
			limitName: cause.limitName,
			limit: cause.limit,
			observed: cause.observed,
		};
	}
	return failure;
};

export const initialCheckpointHealth = ({
	now,
}: {
	now: number;
}): PartitionCheckpointHealth => ({
	status: "waiting",
	lastConfirmedNextOffset: null,
	lastPublishedAt: null,
	lastAttemptAt: null,
	lastDurationMs: null,
	lastSerializedBytes: null,
	dirtySince: now,
	uncheckpointedAgeMs: 0,
	failure: null,
	cleanup: {
		lastPrunedAt: null,
		deletedReceipts: 0,
		lastDurationMs: null,
		backlog: "unknown",
		failure: null,
	},
});
