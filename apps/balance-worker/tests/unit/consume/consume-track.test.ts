import { describe, expect, test } from "bun:test";
import {
	parseTrackCommand,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import { buildIdempotencyStorageKey } from "@autumn/dynamodb";
import { consumeTrack } from "../../../src/consume/consumeTrack.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { PartitionWriterDuplicateCommandError } from "../../../src/processor/writer/writerErrors.js";
import { createFakeIdempotencyKeys } from "../../fixtures/idempotencyKeys.js";
import { createTrackCommand, testIdentity } from "../../fixtures/mutations.js";

const idempotency = { key: "track:item_1", ttlMs: 60_000 };
const { storageKey } = buildIdempotencyStorageKey({
	orgId: testIdentity.orgId,
	env: testIdentity.env,
	idempotencyKey: idempotency.key,
});

function commandOf({
	commandId,
	requestId,
	withKey = true,
}: {
	commandId: string;
	requestId: string;
	withKey?: boolean;
}): TrackCommand {
	return parseTrackCommand({
		input: {
			...createTrackCommand({ identity: testIdentity, commandId, value: 1 }),
			requestId,
			...(withKey && { idempotency }),
		},
	});
}

function createFixture({
	outcome,
}: {
	outcome?: "applied" | "rejected" | Error;
} = {}) {
	const tracked: string[] = [];
	const logs: string[] = [];
	const keys = createFakeIdempotencyKeys();
	const processor = {
		track: async ({ command }: { command: TrackCommand }) => {
			tracked.push(command.commandId);
			if (outcome instanceof Error) throw outcome;
			return { result: { status: outcome ?? "applied", reason: null } };
		},
	} as unknown as PartitionProcessor;
	const ctx = {
		processor,
		idempotencyKeys: keys.keys,
		logger: {
			info: (message: string) => logs.push(`info:${message}`),
			warn: (message: string) => logs.push(`warn:${message}`),
		} as never,
	};
	return { ctx, tracked, logs, keys };
}

describe("consumeTrack", () => {
	test("a command without a key is tracked without touching the store", async () => {
		const { ctx, tracked, keys } = createFixture();
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1", withKey: false }),
		});
		expect(tracked).toEqual(["c1"]);
		expect(keys.owners.size).toBe(0);
	});

	test("the item claims its key under its request id; another item with the same key is skipped", async () => {
		const { ctx, tracked, logs, keys } = createFixture();
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1" }),
		});
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c2", requestId: "r2" }),
		});
		expect(keys.owners.get(storageKey)).toBe("r1");
		expect(tracked).toEqual(["c1"]);
		expect(logs).toEqual([
			"info:Queued track skipped: idempotency key already used",
		]);
	});

	test("an item's fan-out commands and its redelivery resume the same claim", async () => {
		const { ctx, tracked } = createFixture();
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1" }),
		});
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c2", requestId: "r1" }),
		});
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1" }),
		});
		expect(tracked).toEqual(["c1", "c2", "c1"]);
	});

	test("a refused track releases the claim and lets the stream's boundary settle it", async () => {
		const { ctx, keys } = createFixture({
			outcome: new UnsupportedCommandError({ reason: "entity_not_found" }),
		});
		await expect(
			consumeTrack({
				ctx,
				command: commandOf({ commandId: "c1", requestId: "r1" }),
			}),
		).rejects.toBeInstanceOf(UnsupportedCommandError);
		expect(keys.released).toEqual([storageKey]);
	});

	test("an already applied track keeps the claim and lets the stream's boundary settle it", async () => {
		const { ctx, keys } = createFixture({
			outcome: new PartitionWriterDuplicateCommandError({ commandId: "c1" }),
		});
		await expect(
			consumeTrack({
				ctx,
				command: commandOf({ commandId: "c1", requestId: "r1" }),
			}),
		).rejects.toBeInstanceOf(PartitionWriterDuplicateCommandError);
		expect(keys.released).toEqual([]);
	});

	test("a transient failure keeps the claim and comes back for redelivery", async () => {
		const { ctx, keys } = createFixture({
			outcome: new Error("postgres away"),
		});
		await expect(
			consumeTrack({
				ctx,
				command: commandOf({ commandId: "c1", requestId: "r1" }),
			}),
		).rejects.toThrow("postgres away");
		expect(keys.owners.get(storageKey)).toBe("r1");
		expect(keys.released).toEqual([]);
	});

	test("a rejected reply is logged, the claim kept", async () => {
		const { ctx, logs, keys } = createFixture({ outcome: "rejected" });
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1" }),
		});
		expect(logs).toEqual(["warn:Queued track rejected by the balance"]);
		expect(keys.released).toEqual([]);
	});
});
