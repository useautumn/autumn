import { describe, expect, test } from "bun:test";
import { createPartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { planPartitionBootstrap } from "../../../../src/runtime/bootstrap/plan/planPartitionBootstrap.js";

const checkpointAt = (nextOffset: bigint) =>
	createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: 1_700_000_000_000,
		topic: "metering-events-v1",
		partition: 0,
		nextOffset,
		states: [],
		receipts: [],
	});

const plan = ({
	localNextOffset,
	checkpointNextOffset,
	logStartOffset = 0n,
	logEndOffset = 100n,
}: {
	localNextOffset: bigint | null;
	checkpointNextOffset: bigint | null;
	logStartOffset?: bigint;
	logEndOffset?: bigint;
}) =>
	planPartitionBootstrap({
		localNextOffset,
		checkpoint:
			checkpointNextOffset === null ? null : checkpointAt(checkpointNextOffset),
		logRange: { logStartOffset, logEndOffset },
	});

describe("partition bootstrap plan", () => {
	test.each([
		{
			name: "continues retained local state instead of a newer checkpoint",
			input: { localNextOffset: 42n, checkpointNextOffset: 80n },
			expected: { kind: "continue", nextOffset: 42n },
		},
		{
			name: "continues local state exactly at the log end",
			input: { localNextOffset: 100n, checkpointNextOffset: 90n },
			expected: { kind: "continue", nextOffset: 100n },
		},
		{
			name: "refuses local state ahead of the log end",
			input: { localNextOffset: 101n, checkpointNextOffset: 90n },
			expected: {
				kind: "refuse",
				reason: "local_state_ahead_of_log_end",
			},
		},
		{
			name: "replaces local state behind retention from a retained checkpoint",
			input: {
				localNextOffset: 42n,
				checkpointNextOffset: 100n,
				logStartOffset: 100n,
			},
			expected: { kind: "replace", nextOffset: 100n },
		},
		{
			name: "refuses when both local state and checkpoint are behind retention",
			input: {
				localNextOffset: 42n,
				checkpointNextOffset: 90n,
				logStartOffset: 100n,
			},
			expected: {
				kind: "refuse",
				reason: "checkpoint_behind_log_start",
			},
		},
		{
			name: "restores a retained checkpoint when local state is absent",
			input: { localNextOffset: null, checkpointNextOffset: 50n },
			expected: { kind: "restore", nextOffset: 50n },
		},
		{
			name: "prefers a retained checkpoint over empty-log initialization",
			input: { localNextOffset: null, checkpointNextOffset: 0n },
			expected: { kind: "restore", nextOffset: 0n },
		},
		{
			name: "initializes only when local state and checkpoint are absent and the log starts at zero",
			input: { localNextOffset: null, checkpointNextOffset: null },
			expected: { kind: "initialize", nextOffset: 0n },
		},
		{
			name: "refuses a retention gap without a checkpoint",
			input: {
				localNextOffset: null,
				checkpointNextOffset: null,
				logStartOffset: 100n,
			},
			expected: {
				kind: "refuse",
				reason: "checkpoint_required_for_retention_gap",
			},
		},
		{
			name: "refuses a checkpoint ahead of the log end",
			input: {
				localNextOffset: null,
				checkpointNextOffset: 201n,
				logStartOffset: 100n,
				logEndOffset: 200n,
			},
			expected: {
				kind: "refuse",
				reason: "checkpoint_ahead_of_log_end",
			},
		},
		{
			name: "refuses an old checkpoint when a recreated log starts at zero",
			input: {
				localNextOffset: null,
				checkpointNextOffset: 500n,
				logStartOffset: 0n,
				logEndOffset: 100n,
			},
			expected: {
				kind: "refuse",
				reason: "checkpoint_ahead_of_log_end",
			},
		},
	])("$name", ({ input, expected }) => {
		const result = plan(input);
		const comparableResult =
			result.kind === "restore" || result.kind === "replace"
				? { kind: result.kind, nextOffset: result.checkpoint.nextOffset }
				: result;
		expect(comparableResult).toEqual(expected);
	});

	test("rejects an invalid Kafka range before making a decision", () => {
		expect(() =>
			plan({
				localNextOffset: null,
				checkpointNextOffset: null,
				logStartOffset: 2n,
				logEndOffset: 1n,
			}),
		).toThrow("Kafka log start cannot exceed its end");
	});
});
