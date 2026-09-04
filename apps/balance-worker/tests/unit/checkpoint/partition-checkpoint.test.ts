import { describe, expect, test } from "bun:test";
import {
	executeTrack,
	meteringPartitionKeyOf,
	stateInitializationFingerprintOf,
} from "@autumn/balance-engine";
import {
	assertPartitionCheckpointOwnership,
	createPartitionCheckpoint,
	InvalidPartitionCheckpointError,
	PartitionCheckpointContentHashMismatchError,
	parsePartitionCheckpoint,
	serializePartitionCheckpoint,
	UnsupportedPartitionCheckpointSchemaVersionError,
} from "../../../src/checkpoint/partitionCheckpoint.js";
import {
	createOutcome,
	createState,
	partition,
	topic,
} from "../kafka/kafka-test-fixtures.js";

const checkpointCreatedAt = 1_700_000_000_000;

const createCheckpoint = () => {
	const initialState = createState();
	const outcome = createOutcome({ state: initialState });
	const state = executeTrack({ state: initialState, outcome }).state;
	const partitionKey = meteringPartitionKeyOf({ identity: state.identity });
	const initializationId = "init_1";

	return createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: checkpointCreatedAt,
		topic,
		partition,
		nextOffset: 2n,
		states: [
			{
				partitionKey,
				initializationId,
				initializationFingerprint: stateInitializationFingerprintOf({
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId,
						initializedAt: checkpointCreatedAt,
						state: initialState,
					},
				}),
				state,
			},
		],
		receipts: [{ partitionKey, recordOffset: 1n, outcome }],
	});
};

describe("partition checkpoint", () => {
	test("round-trips a versioned checkpoint with a verified content hash", () => {
		const checkpoint = createCheckpoint();
		const serialized = serializePartitionCheckpoint({ checkpoint });

		expect(parsePartitionCheckpoint({ input: serialized })).toEqual(checkpoint);
		expect(checkpoint.contentHash).toMatch(/^[a-f0-9]{64}$/);
	});

	test("detects valid-looking checkpoint content changed after export", () => {
		const serialized = JSON.parse(
			serializePartitionCheckpoint({ checkpoint: createCheckpoint() }),
		) as Record<string, unknown>;
		serialized.topic = "another-topic";

		expect(() => parsePartitionCheckpoint({ input: serialized })).toThrow(
			PartitionCheckpointContentHashMismatchError,
		);
	});

	test("refuses unsupported checkpoint and engine schema versions", () => {
		const unsupportedCheckpoint = JSON.parse(
			serializePartitionCheckpoint({ checkpoint: createCheckpoint() }),
		) as Record<string, unknown>;
		unsupportedCheckpoint.schemaVersion = 2;
		expect(() =>
			parsePartitionCheckpoint({ input: unsupportedCheckpoint }),
		).toThrow(UnsupportedPartitionCheckpointSchemaVersionError);

		const unsupportedEngine = JSON.parse(
			serializePartitionCheckpoint({ checkpoint: createCheckpoint() }),
		) as Record<string, unknown>;
		unsupportedEngine.engineSchemaVersion = 2;
		expect(() =>
			parsePartitionCheckpoint({ input: unsupportedEngine }),
		).toThrow(InvalidPartitionCheckpointError);
	});

	test("validates topic and resolved partition ownership before restore", () => {
		const checkpoint = createCheckpoint();
		const resolver = { partitionForIdentity: () => partition };

		expect(() =>
			assertPartitionCheckpointOwnership({
				checkpoint,
				topic: "another-topic",
				partition,
				partitionResolver: resolver,
			}),
		).toThrow(InvalidPartitionCheckpointError);
		expect(() =>
			assertPartitionCheckpointOwnership({
				checkpoint,
				topic,
				partition,
				partitionResolver: { partitionForIdentity: () => partition + 1 },
			}),
		).toThrow(InvalidPartitionCheckpointError);
	});

	test("requires every receipt to belong to checkpoint state", () => {
		const checkpoint = createCheckpoint();
		const receipt = checkpoint.receipts[0];
		if (!receipt) throw new Error("Expected checkpoint receipt");

		expect(() =>
			createPartitionCheckpoint({
				...checkpoint,
				states: [],
				receipts: [receipt],
			}),
		).toThrow(InvalidPartitionCheckpointError);
	});

	test("exports only receipts unexpired at the checkpoint cut", () => {
		const checkpoint = createCheckpoint();
		const receipt = checkpoint.receipts[0];
		if (!receipt) throw new Error("Expected checkpoint receipt");

		expect(() =>
			createPartitionCheckpoint({
				...checkpoint,
				createdAt: receipt.outcome.deduplicationExpiresAt,
			}),
		).toThrow(InvalidPartitionCheckpointError);
	});

	test("rejects receipt offsets outside the checkpoint cut", () => {
		const checkpoint = createCheckpoint();
		const receipt = checkpoint.receipts[0];
		if (!receipt) throw new Error("Expected checkpoint receipt");

		expect(() =>
			createPartitionCheckpoint({
				...checkpoint,
				receipts: [{ ...receipt, recordOffset: checkpoint.nextOffset }],
			}),
		).toThrow(InvalidPartitionCheckpointError);
	});
});
