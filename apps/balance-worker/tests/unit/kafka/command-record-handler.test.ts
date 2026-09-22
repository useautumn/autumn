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
import { createFakeIdempotencyKeys } from "../../fixtures/idempotencyKeys.js";
import { createTrackCommand, testIdentity } from "../../fixtures/mutations.js";

const topic = "local-commands";
const partition = 0;

function createFixture({
	outcome,
	owned = true,
	commandNextOffset = null,
}: {
	outcome?: "applied" | "rejected" | Error;
	owned?: boolean;
	commandNextOffset?: bigint | null;
} = {}) {
	const tracked: TrackCommand[] = [];
	const sources: unknown[] = [];
	const completed: unknown[] = [];
	const logs: string[] = [];
	const runtime = {
		process: async (run: (processor: never) => Promise<unknown>) => {
			const processor = {
				execute: async ({
					source,
					run,
				}: {
					source: unknown;
					run: (processor: never) => Promise<unknown>;
				}) => {
					sources.push(source);
					const result = await run(processor as never);
					completed.push(source);
					return result;
				},
				track: async (params: { command: TrackCommand }) => {
					expect(Object.keys(params)).toEqual(["command"]);
					tracked.push(params.command);
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
			readCommandNextOffset: () => commandNextOffset,
			idempotencyKeys: createFakeIdempotencyKeys().keys,
			logger: {
				info: (message: string) => logs.push(`info:${message}`),
				warn: (message: string) => logs.push(`warn:${message}`),
			} as never,
		},
	});
	return { handler, tracked, sources, logs, completed };
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
		const { handler, tracked, logs, completed } = createFixture();
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 0n }),
		).toBeNull();
		expect(await handler.applyRecord(recordOf({ command }))).toBeUndefined();
		expect(tracked).toEqual([command]);
		expect(completed).toEqual([{ commandOffset: "7" }]);
		expect(logs).toEqual([]);
	});

	test("the record's offset belongs to the execution, not the track command, and the bookmark skips a batch that starts below it", async () => {
		const { handler, sources } = createFixture({ commandNextOffset: 5n });
		await handler.applyRecord(recordOf({ command }));
		expect(sources).toEqual([{ commandOffset: "7" }]);
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 2n }),
		).toBe(5n);
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 5n }),
		).toBeNull();
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 9n }),
		).toBeNull();
	});

	test("a record below the durable bookmark never reaches business processing", async () => {
		const { handler, tracked, completed } = createFixture({
			commandNextOffset: 8n,
		});
		expect(await handler.applyRecord(recordOf({ command }))).toEqual({
			nextOffset: 8n,
		});
		expect(tracked).toEqual([]);
		expect(completed).toEqual([]);
	});

	test("already applied and refused outcomes are logged and consumed, not thrown", async () => {
		const duplicate = createFixture({
			outcome: new PartitionWriterDuplicateCommandError({ commandId: "cmd_1" }),
		});
		await duplicate.handler.applyRecord(recordOf({ command }));
		expect(duplicate.completed).toEqual([{ commandOffset: "7" }]);
		expect(duplicate.logs).toEqual(["info:Queued track already applied"]);

		const refused = createFixture({
			outcome: new UnsupportedCommandError({ reason: "feature_not_found" }),
		});
		await refused.handler.applyRecord(recordOf({ command }));
		expect(refused.completed).toEqual([{ commandOffset: "7" }]);
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
		expect(failing.completed).toEqual([]);

		const unowned = createFixture({ owned: false });
		await expect(
			unowned.handler.applyRecord(recordOf({ command })),
		).rejects.toBeInstanceOf(CommandPartitionUnavailableError);
		expect(unowned.tracked).toEqual([]);
		expect(failing.completed).toEqual([]);
		expect(unowned.completed).toEqual([]);
	});

	test("an unreadable record is skipped with a warning instead of failing the partition", async () => {
		const { handler, tracked, logs, completed } = createFixture();
		await handler.applyRecord({
			topic,
			partition,
			message: { offset: "7", key: null, value: Buffer.from("not json") },
		});
		expect(tracked).toEqual([]);
		expect(completed).toEqual([{ commandOffset: "7" }]);
		expect(logs).toEqual(["warn:Queued command skipped: unreadable"]);
	});
});
