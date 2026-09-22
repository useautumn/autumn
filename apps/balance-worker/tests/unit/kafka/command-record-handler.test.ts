import { describe, expect, test } from "bun:test";
import {
	parseTrackCommand,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import { serializeCommandRecord } from "@autumn/kafka";
import { CommandPartitionUnavailableError } from "../../../src/kafka/commandConsumer/commandConsumerErrors.js";
import { createCommandRecordHandler } from "../../../src/kafka/commandConsumer/createCommandRecordHandler.js";
import type { PartitionRuntimePort } from "../../../src/partitions/types/partitions.js";
import { PartitionWriterDuplicateCommandError } from "../../../src/processor/writer/writerErrors.js";
import { createTrackCommand, testIdentity } from "../../fixtures/mutations.js";

const topic = "local-commands";
const partition = 0;

function createFixture({
	outcome,
	owned = true,
}: {
	outcome?: "applied" | "rejected" | Error;
	owned?: boolean;
} = {}) {
	const tracked: TrackCommand[] = [];
	const logs: string[] = [];
	const runtime = {
		process: async (run: (processor: never) => Promise<unknown>) => {
			const processor = {
				track: async ({ command }: { command: TrackCommand }) => {
					tracked.push(command);
					if (outcome instanceof Error) throw outcome;
					return { result: { status: outcome ?? "applied", reason: null } };
				},
			};
			return run(processor as never);
		},
	} as unknown as PartitionRuntimePort;
	const handler = createCommandRecordHandler({
		ctx: {
			findOwnedRuntime: () => (owned ? runtime : undefined),
			logger: {
				info: (message: string) => logs.push(`info:${message}`),
				warn: (message: string) => logs.push(`warn:${message}`),
			} as never,
		},
	});
	return { handler, tracked, logs };
}

const command = parseTrackCommand({
	input: createTrackCommand({
		identity: testIdentity,
		commandId: "cmd_1",
		value: 2,
	}),
});

function recordOf({ command: record }: { command: TrackCommand }) {
	return {
		topic,
		partition,
		message: { offset: "7", ...serializeCommandRecord({ record }) },
	};
}

describe("command record handler", () => {
	test("a queued track reaches the partition's processor and resolves with no reply", async () => {
		const { handler, tracked, logs } = createFixture();
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 0n }),
		).toBeNull();
		expect(await handler.applyRecord(recordOf({ command }))).toBeUndefined();
		expect(tracked).toEqual([command]);
		expect(logs).toEqual([]);
	});

	test("already applied and refused outcomes are logged and consumed, not thrown", async () => {
		const duplicate = createFixture({
			outcome: new PartitionWriterDuplicateCommandError({ commandId: "cmd_1" }),
		});
		await duplicate.handler.applyRecord(recordOf({ command }));
		expect(duplicate.logs).toEqual(["info:Queued track already applied"]);

		const refused = createFixture({
			outcome: new UnsupportedCommandError({ reason: "feature_not_found" }),
		});
		await refused.handler.applyRecord(recordOf({ command }));
		expect(refused.logs).toEqual(["warn:Queued track refused"]);

		const rejected = createFixture({ outcome: "rejected" });
		await rejected.handler.applyRecord(recordOf({ command }));
		expect(rejected.logs).toEqual([
			"warn:Queued track rejected by the balance",
		]);
	});

	test("anything else is thrown so Kafka redelivers, and an unowned partition never consumes", async () => {
		const failing = createFixture({ outcome: new Error("recovery required") });
		await expect(
			failing.handler.applyRecord(recordOf({ command })),
		).rejects.toThrow("recovery required");

		const unowned = createFixture({ owned: false });
		await expect(
			unowned.handler.applyRecord(recordOf({ command })),
		).rejects.toBeInstanceOf(CommandPartitionUnavailableError);
		expect(unowned.tracked).toEqual([]);
	});

	test("an unreadable record is skipped with a warning instead of failing the partition", async () => {
		const { handler, tracked, logs } = createFixture();
		await handler.applyRecord({
			topic,
			partition,
			message: { offset: "7", key: null, value: Buffer.from("not json") },
		});
		expect(tracked).toEqual([]);
		expect(logs).toEqual(["warn:Queued command skipped: unreadable"]);
	});
});
