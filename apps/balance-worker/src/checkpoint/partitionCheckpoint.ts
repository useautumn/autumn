import { createHash } from "node:crypto";
import {
	type CustomerMeteringState,
	meteringPartitionKeyOf,
	parseCustomerMeteringState,
	parseTrackOutcome,
	type TrackOutcome,
} from "@autumn/balance-engine";

const CHECKPOINT_SCHEMA_VERSION = 1 as const;
const ENGINE_SCHEMA_VERSION = 1 as const;
const contentHashPattern = /^[a-f0-9]{64}$/;
const offsetPattern = /^(0|[1-9][0-9]*)$/;

export type PartitionCheckpointStateV1 = {
	partitionKey: string;
	initializationId: string;
	initializationFingerprint: string;
	state: CustomerMeteringState;
};

export type PartitionCheckpointReceiptV1 = {
	partitionKey: string;
	recordOffset: bigint;
	outcome: TrackOutcome;
};

export type PartitionCheckpointContentsV1 = {
	engineSchemaVersion: 1;
	createdAt: number;
	topic: string;
	partition: number;
	nextOffset: bigint;
	states: readonly PartitionCheckpointStateV1[];
	receipts: readonly PartitionCheckpointReceiptV1[];
};

export type PartitionCheckpointV1 = PartitionCheckpointContentsV1 & {
	schemaVersion: 1;
	contentHash: string;
};

export type PartitionCheckpointPartitionResolver = {
	partitionForIdentity({
		identity,
	}: {
		identity: CustomerMeteringState["identity"];
	}): number;
};

export class InvalidPartitionCheckpointError extends Error {
	constructor({ message, cause }: { message: string; cause?: unknown }) {
		super(message, { cause });
		this.name = "InvalidPartitionCheckpointError";
	}
}

export class UnsupportedPartitionCheckpointSchemaVersionError extends Error {
	readonly schemaVersion: number;

	constructor({ schemaVersion }: { schemaVersion: number }) {
		super(`Unsupported partition checkpoint schema version: ${schemaVersion}`);
		this.name = "UnsupportedPartitionCheckpointSchemaVersionError";
		this.schemaVersion = schemaVersion;
	}
}

export class PartitionCheckpointContentHashMismatchError extends Error {
	constructor() {
		super("Partition checkpoint content hash does not match its contents");
		this.name = "PartitionCheckpointContentHashMismatchError";
	}
}

const requireRecord = ({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new InvalidPartitionCheckpointError({
			message: `${name} must be an object`,
		});
	}
	return value as Record<string, unknown>;
};

const assertExactKeys = ({
	name,
	value,
	keys,
}: {
	name: string;
	value: Record<string, unknown>;
	keys: readonly string[];
}): void => {
	const expectedKeys = new Set(keys);
	const actualKeys = Object.keys(value);
	if (
		actualKeys.length !== expectedKeys.size ||
		actualKeys.some((key) => !expectedKeys.has(key))
	) {
		throw new InvalidPartitionCheckpointError({
			message: `${name} has unexpected fields`,
		});
	}
};

const requireNonEmptyString = ({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): string => {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new InvalidPartitionCheckpointError({
			message: `${name} must be a non-empty string`,
		});
	}
	return value;
};

const requireNonNegativeInteger = ({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): number => {
	if (!Number.isSafeInteger(value) || Number(value) < 0) {
		throw new InvalidPartitionCheckpointError({
			message: `${name} must be a non-negative safe integer`,
		});
	}
	return Number(value);
};

const requireOffset = ({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): bigint => {
	if (typeof value !== "string" || !offsetPattern.test(value)) {
		throw new InvalidPartitionCheckpointError({
			message: `${name} must be a canonical non-negative offset`,
		});
	}
	return BigInt(value);
};

const parseState = ({ input }: { input: unknown }): CustomerMeteringState => {
	try {
		return parseCustomerMeteringState({ input });
	} catch (cause) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint contains invalid customer state",
			cause,
		});
	}
};

const parseOutcome = ({ input }: { input: unknown }): TrackOutcome => {
	try {
		return parseTrackOutcome({ input });
	} catch (cause) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint contains an invalid track receipt",
			cause,
		});
	}
};

const canonicalize = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, entry]) => [key, canonicalize(entry)]),
	);
};

const serializedContentsOf = ({
	checkpoint,
}: {
	checkpoint: PartitionCheckpointContentsV1;
}) => ({
	schemaVersion: CHECKPOINT_SCHEMA_VERSION,
	engineSchemaVersion: checkpoint.engineSchemaVersion,
	createdAt: checkpoint.createdAt,
	topic: checkpoint.topic,
	partition: checkpoint.partition,
	nextOffset: checkpoint.nextOffset.toString(),
	states: checkpoint.states,
	receipts: checkpoint.receipts.map(({ recordOffset, ...receipt }) => ({
		...receipt,
		recordOffset: recordOffset.toString(),
	})),
});

const contentHashOf = ({
	checkpoint,
}: {
	checkpoint: PartitionCheckpointContentsV1;
}): string =>
	createHash("sha256")
		.update(JSON.stringify(canonicalize(serializedContentsOf({ checkpoint }))))
		.digest("hex");

const normalizedContentsOf = ({
	engineSchemaVersion,
	createdAt,
	topic,
	partition,
	nextOffset,
	states,
	receipts,
}: PartitionCheckpointContentsV1): PartitionCheckpointContentsV1 => {
	if (engineSchemaVersion !== ENGINE_SCHEMA_VERSION) {
		throw new InvalidPartitionCheckpointError({
			message: `Unsupported balance engine schema version: ${engineSchemaVersion}`,
		});
	}
	const normalizedCreatedAt = requireNonNegativeInteger({
		name: "Checkpoint createdAt",
		value: createdAt,
	});
	const normalizedTopic = requireNonEmptyString({
		name: "Checkpoint topic",
		value: topic,
	});
	const normalizedPartition = requireNonNegativeInteger({
		name: "Checkpoint partition",
		value: partition,
	});
	if (nextOffset < 0n) {
		throw new InvalidPartitionCheckpointError({
			message: "Checkpoint nextOffset cannot be negative",
		});
	}

	const stateByPartitionKey = new Map<string, CustomerMeteringState>();
	const normalizedStates = states
		.map((entry) => {
			const partitionKey = requireNonEmptyString({
				name: "Checkpoint state partitionKey",
				value: entry.partitionKey,
			});
			if (stateByPartitionKey.has(partitionKey)) {
				throw new InvalidPartitionCheckpointError({
					message: `Duplicate checkpoint state: ${partitionKey}`,
				});
			}
			const state = parseState({ input: entry.state });
			if (
				meteringPartitionKeyOf({ identity: state.identity }) !== partitionKey
			) {
				throw new InvalidPartitionCheckpointError({
					message: `Checkpoint state identity does not match ${partitionKey}`,
				});
			}
			stateByPartitionKey.set(partitionKey, state);
			return {
				partitionKey,
				initializationId: requireNonEmptyString({
					name: "Checkpoint state initializationId",
					value: entry.initializationId,
				}),
				initializationFingerprint: requireNonEmptyString({
					name: "Checkpoint state initializationFingerprint",
					value: entry.initializationFingerprint,
				}),
				state,
			};
		})
		.sort(({ partitionKey: left }, { partitionKey: right }) =>
			left < right ? -1 : left > right ? 1 : 0,
		);

	const receiptKeys = new Set<string>();
	const recordOffsets = new Set<bigint>();
	const normalizedReceipts = receipts
		.map((entry) => {
			const partitionKey = requireNonEmptyString({
				name: "Checkpoint receipt partitionKey",
				value: entry.partitionKey,
			});
			const state = stateByPartitionKey.get(partitionKey);
			if (!state) {
				throw new InvalidPartitionCheckpointError({
					message: `Checkpoint receipt has no state: ${partitionKey}`,
				});
			}
			if (entry.recordOffset < 0n || entry.recordOffset >= nextOffset) {
				throw new InvalidPartitionCheckpointError({
					message: `Checkpoint receipt offset is outside its cut: ${entry.recordOffset}`,
				});
			}
			if (recordOffsets.has(entry.recordOffset)) {
				throw new InvalidPartitionCheckpointError({
					message: `Duplicate checkpoint receipt offset: ${entry.recordOffset}`,
				});
			}
			recordOffsets.add(entry.recordOffset);
			const outcome = parseOutcome({ input: entry.outcome });
			if (
				meteringPartitionKeyOf({ identity: outcome.identity }) !== partitionKey
			) {
				throw new InvalidPartitionCheckpointError({
					message: `Checkpoint receipt identity does not match ${partitionKey}`,
				});
			}
			if (outcome.revisionAfter > state.revision) {
				throw new InvalidPartitionCheckpointError({
					message: `Checkpoint receipt is newer than state: ${partitionKey}`,
				});
			}
			if (outcome.deduplicationExpiresAt <= normalizedCreatedAt) {
				throw new InvalidPartitionCheckpointError({
					message: `Checkpoint receipt was expired at export: ${outcome.commandId}`,
				});
			}
			const receiptKey = JSON.stringify([partitionKey, outcome.commandId]);
			if (receiptKeys.has(receiptKey)) {
				throw new InvalidPartitionCheckpointError({
					message: `Duplicate checkpoint receipt: ${outcome.commandId}`,
				});
			}
			receiptKeys.add(receiptKey);
			return { partitionKey, recordOffset: entry.recordOffset, outcome };
		})
		.sort((left, right) =>
			left.recordOffset < right.recordOffset
				? -1
				: left.recordOffset > right.recordOffset
					? 1
					: 0,
		);

	return {
		engineSchemaVersion: ENGINE_SCHEMA_VERSION,
		createdAt: normalizedCreatedAt,
		topic: normalizedTopic,
		partition: normalizedPartition,
		nextOffset,
		states: normalizedStates,
		receipts: normalizedReceipts,
	};
};

export const createPartitionCheckpoint = (
	contents: PartitionCheckpointContentsV1,
): PartitionCheckpointV1 => {
	const normalizedContents = normalizedContentsOf(contents);
	return {
		schemaVersion: CHECKPOINT_SCHEMA_VERSION,
		...normalizedContents,
		contentHash: contentHashOf({ checkpoint: normalizedContents }),
	};
};

export const serializePartitionCheckpoint = ({
	checkpoint,
}: {
	checkpoint: PartitionCheckpointV1;
}): string => {
	const normalized = createPartitionCheckpoint(checkpoint);
	if (normalized.contentHash !== checkpoint.contentHash) {
		throw new PartitionCheckpointContentHashMismatchError();
	}
	return JSON.stringify({
		...serializedContentsOf({ checkpoint: normalized }),
		contentHash: normalized.contentHash,
	});
};

export const assertPartitionCheckpointOwnership = ({
	checkpoint,
	topic,
	partition,
	partitionResolver,
}: {
	checkpoint: PartitionCheckpointV1;
	topic: string;
	partition: number;
	partitionResolver: PartitionCheckpointPartitionResolver;
}): void => {
	serializePartitionCheckpoint({ checkpoint });
	if (checkpoint.topic !== topic || checkpoint.partition !== partition) {
		throw new InvalidPartitionCheckpointError({
			message: `Checkpoint does not belong to ${topic}[${partition}]`,
		});
	}

	for (const state of checkpoint.states) {
		const resolvedPartition = partitionResolver.partitionForIdentity({
			identity: state.state.identity,
		});
		if (resolvedPartition !== partition) {
			throw new InvalidPartitionCheckpointError({
				message: `Checkpoint state ${state.partitionKey} resolves to partition ${resolvedPartition}`,
			});
		}
	}
	for (const receipt of checkpoint.receipts) {
		const resolvedPartition = partitionResolver.partitionForIdentity({
			identity: receipt.outcome.identity,
		});
		if (resolvedPartition !== partition) {
			throw new InvalidPartitionCheckpointError({
				message: `Checkpoint receipt ${receipt.outcome.commandId} resolves to partition ${resolvedPartition}`,
			});
		}
	}
};

export const parsePartitionCheckpoint = ({
	input,
}: {
	input: unknown;
}): PartitionCheckpointV1 => {
	let parsedInput = input;
	if (typeof input === "string") {
		try {
			parsedInput = JSON.parse(input);
		} catch (cause) {
			throw new InvalidPartitionCheckpointError({
				message: "Partition checkpoint is not valid JSON",
				cause,
			});
		}
	}
	const parsedCheckpoint = requireRecord({
		name: "Partition checkpoint",
		value: parsedInput,
	});
	assertExactKeys({
		name: "Partition checkpoint",
		value: parsedCheckpoint,
		keys: [
			"schemaVersion",
			"engineSchemaVersion",
			"createdAt",
			"topic",
			"partition",
			"nextOffset",
			"states",
			"receipts",
			"contentHash",
		],
	});
	if (parsedCheckpoint.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
		if (typeof parsedCheckpoint.schemaVersion === "number") {
			throw new UnsupportedPartitionCheckpointSchemaVersionError({
				schemaVersion: parsedCheckpoint.schemaVersion,
			});
		}
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint schemaVersion must be 1",
		});
	}
	if (
		!Array.isArray(parsedCheckpoint.states) ||
		!Array.isArray(parsedCheckpoint.receipts)
	) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint states and receipts must be arrays",
		});
	}

	const states = parsedCheckpoint.states.map((entry, index) => {
		const stateEntry = requireRecord({
			name: `Checkpoint state ${index}`,
			value: entry,
		});
		assertExactKeys({
			name: `Checkpoint state ${index}`,
			value: stateEntry,
			keys: [
				"partitionKey",
				"initializationId",
				"initializationFingerprint",
				"state",
			],
		});
		return {
			partitionKey: stateEntry.partitionKey as string,
			initializationId: stateEntry.initializationId as string,
			initializationFingerprint: stateEntry.initializationFingerprint as string,
			state: stateEntry.state as CustomerMeteringState,
		};
	});
	const receipts = parsedCheckpoint.receipts.map((entry, index) => {
		const receiptEntry = requireRecord({
			name: `Checkpoint receipt ${index}`,
			value: entry,
		});
		assertExactKeys({
			name: `Checkpoint receipt ${index}`,
			value: receiptEntry,
			keys: ["partitionKey", "recordOffset", "outcome"],
		});
		return {
			partitionKey: receiptEntry.partitionKey as string,
			recordOffset: requireOffset({
				name: `Checkpoint receipt ${index} recordOffset`,
				value: receiptEntry.recordOffset,
			}),
			outcome: receiptEntry.outcome as TrackOutcome,
		};
	});
	const checkpoint = createPartitionCheckpoint({
		engineSchemaVersion: parsedCheckpoint.engineSchemaVersion as 1,
		createdAt: parsedCheckpoint.createdAt as number,
		topic: parsedCheckpoint.topic as string,
		partition: parsedCheckpoint.partition as number,
		nextOffset: requireOffset({
			name: "Checkpoint nextOffset",
			value: parsedCheckpoint.nextOffset,
		}),
		states,
		receipts,
	});
	const contentHash = requireNonEmptyString({
		name: "Checkpoint contentHash",
		value: parsedCheckpoint.contentHash,
	});
	if (
		!contentHashPattern.test(contentHash) ||
		contentHash !== checkpoint.contentHash
	) {
		throw new PartitionCheckpointContentHashMismatchError();
	}
	return checkpoint;
};
