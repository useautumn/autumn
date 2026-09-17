export type PartitionCheckpointLimits = {
	maxSerializedBytes: number;
	maxStates: number;
	maxReceipts: number;
};

export type PartitionCheckpointLimitName =
	| "receipts"
	| "serialized_bytes"
	| "states";

export class PartitionCheckpointLimitExceededError extends Error {
	readonly limitName: PartitionCheckpointLimitName;
	readonly limit: number;
	readonly observed: number;

	constructor({
		limitName,
		limit,
		observed,
	}: {
		limitName: PartitionCheckpointLimitName;
		limit: number;
		observed: number;
	}) {
		super(
			`Partition checkpoint ${limitName} limit ${limit} exceeded by ${observed}`,
		);
		this.name = "PartitionCheckpointLimitExceededError";
		this.limitName = limitName;
		this.limit = limit;
		this.observed = observed;
	}
}

const assertLimit = ({
	name,
	value,
}: {
	name: string;
	value: number;
}): void => {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive safe integer`);
	}
};

export const assertPartitionCheckpointLimits = ({
	limits,
}: {
	limits: PartitionCheckpointLimits;
}): void => {
	assertLimit({ name: "maxSerializedBytes", value: limits.maxSerializedBytes });
	assertLimit({ name: "maxStates", value: limits.maxStates });
	assertLimit({ name: "maxReceipts", value: limits.maxReceipts });
};

export const assertPartitionCheckpointWithinLimit = ({
	limitName,
	limit,
	observed,
}: {
	limitName: PartitionCheckpointLimitName;
	limit: number;
	observed: number;
}): void => {
	if (observed <= limit) return;
	throw new PartitionCheckpointLimitExceededError({
		limitName,
		limit,
		observed,
	});
};
