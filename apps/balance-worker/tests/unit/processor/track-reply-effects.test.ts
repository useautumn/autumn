import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MutationEffect } from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { WebhookEventType } from "@autumn/shared";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../../src/state/types/stateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	createState,
	createTrackCommand,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";

const topic = "track-reply-effects";
const partition = 0;

class RecordingCommittedAppender implements CommittedOutcomeAppender {
	private nextOffset = 0n;

	async appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		const baseOffset = this.nextOffset;
		this.nextOffset += BigInt(outcomes.length);
		return { baseOffset };
	}
}

let directory: string;
let store: SqliteStateStore;
let processor: PartitionProcessor;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "autumn-track-reply-effects-"));
	store = openStateStore({ databasePath: join(directory, "state.sqlite") });
	store.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({
		store,
		topic,
		partition,
		states: [
			createState({
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			}),
		],
	});
	processor = createPartitionProcessor({
		ctx: {
			stateStore: store,
			appender: new RecordingCommittedAppender(),
			db: createSyntheticWorkerDb(),
			catalogCache: createTestCatalogCache(),
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => {},
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
});

afterEach(() => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
});

const eventTypesOf = (reply: { effects?: MutationEffect[] }) =>
	(reply.effects ?? []).flatMap((effect) =>
		effect.type === "balance_webhook" ? [effect.eventType] : [],
	);

describe("track reply effects", () => {
	test("a track that leaves the feature allowed replies with no webhook", async () => {
		const reply = await processor.track({
			command: createTrackCommand({ value: 5 }),
		});

		expect(eventTypesOf(reply)).toEqual([]);
	});

	test("a track that exhausts the feature replies with its limit_reached webhook", async () => {
		const reply = await processor.track({
			command: createTrackCommand({ value: 10 }),
		});

		expect(eventTypesOf(reply)).toEqual([
			WebhookEventType.BalancesLimitReached,
		]);
	});

	test("a retry of that track replies with no effects, so the server cannot send twice", async () => {
		const command = createTrackCommand({ value: 10, commandId: "cmd_retry" });
		await processor.track({ command });

		const retry = await processor.track({ command });

		expect(retry.effects).toEqual([]);
	});
});
