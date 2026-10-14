import { describe, expect, test } from "bun:test";
import {
	parseTrackCommand,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import { buildIdempotencyStorageKey } from "@autumn/dynamodb";
import {
	claimTrackBatch,
	consumeTrack,
} from "../../../src/consume/consumeTrack.js";
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
	refuses,
}: {
	outcome?: "applied" | "rejected" | Error;
	/** Refuses just the commands it names, for good. */
	refuses?: (command: TrackCommand) => boolean;
} = {}) {
	const tracked: string[] = [];
	const decided: TrackCommand[] = [];
	const logs: string[] = [];
	const keys = createFakeIdempotencyKeys();
	const processor = {
		decideTrack: async ({ command }: { command: TrackCommand }) => {
			tracked.push(command.commandId);
			decided.push(command);
			if (outcome instanceof Error) throw outcome;
			if (refuses?.(command))
				throw new UnsupportedCommandError({ reason: "feature_not_found" });
			const result = {
				type: "track",
				status: outcome ?? "applied",
				reason: null,
			};
			async function waitForCommit() {
				return { mutation: { result } };
			}
			return { kind: "write", waitForCommit };
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
	return { ctx, tracked, decided, logs, keys };
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

	test("a decided track hands back how to free its claim if the store refuses its commit; the decide itself keeps it", async () => {
		const { ctx, keys } = createFixture();
		const queued = await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1" }),
		});
		expect(keys.owners.get(storageKey)).toBe("r1");
		expect(keys.released).toEqual([]);

		await queued?.onRefused?.();
		expect(keys.released).toEqual([storageKey]);
	});

	const source = { atomId: "atom_1", writerId: "w_1", seq: 4 };
	const sourced = ({
		commandId,
		requestId,
	}: {
		commandId: string;
		requestId: string;
	}) =>
		parseTrackCommand({
			input: { ...commandOf({ commandId, requestId }), source },
		});
	/** What lands for a sourced command that will never deduct: its seq alone, under its own command id. */
	const seqOnly = (command: TrackCommand) => ({
		commandId: command.commandId,
		value: 0,
		usageEvent: null,
		enforceOverdueBlock: false,
		idempotency: undefined,
		source,
	});

	test("an Atom's command skipped as a duplicate still lands its seq, as a track of nothing", async () => {
		const { ctx, decided, keys } = createFixture();
		await consumeTrack({
			ctx,
			command: commandOf({ commandId: "c1", requestId: "r1" }),
		});
		const atomCommand = sourced({ commandId: "c2", requestId: "r2" });
		const queued = await consumeTrack({ ctx, command: atomCommand });

		expect(queued).not.toBeNull();
		expect(decided.map(({ commandId }) => commandId)).toEqual(["c1", "c2"]);
		expect(decided[1]).toMatchObject(seqOnly(atomCommand));
		expect(keys.owners.get(storageKey)).toBe("r1");
	});

	test("an Atom's command refused for good lands its seq the same way, and still frees its claim", async () => {
		const { ctx, decided, keys } = createFixture({
			refuses: (command) => command.value > 0,
		});
		const atomCommand = sourced({ commandId: "c1", requestId: "r1" });
		const queued = await consumeTrack({ ctx, command: atomCommand });

		expect(queued).not.toBeNull();
		expect(decided[1]).toMatchObject(seqOnly(atomCommand));
		expect(keys.released).toEqual([storageKey]);
	});

	describe("a Kafka batch's claims, sent together", () => {
		const keyed = ({
			commandId,
			requestId,
			key,
		}: {
			commandId: string;
			requestId: string;
			key: string;
		}) =>
			parseTrackCommand({
				input: {
					...commandOf({ commandId, requestId }),
					idempotency: { key, ttlMs: 60_000 },
					source: { ...source, seq: Number(commandId.slice(1)) },
				},
			});
		const storageKeyOf = (key: string) =>
			buildIdempotencyStorageKey({
				orgId: testIdentity.orgId,
				env: testIdentity.env,
				idempotencyKey: key,
			}).storageKey;

		test("every key is claimed before the first track decides; each track then decides in order with today's outcome", async () => {
			const { ctx, decided, keys } = createFixture({
				refuses: (command) => command.commandId === "c3" && command.value > 0,
			});
			keys.owners.set(storageKeyOf("k2"), "someone_else");
			const claimsIssued: string[] = [];
			const claim = ctx.idempotencyKeys.claim;
			ctx.idempotencyKeys = {
				...ctx.idempotencyKeys,
				claim: (params) => {
					claimsIssued.push(params.storageKey);
					return claim(params);
				},
			};
			const commands = ["1", "2", "3"].map((n) =>
				keyed({ commandId: `c${n}`, requestId: `r${n}`, key: `k${n}` }),
			);

			const claims = claimTrackBatch({ ctx, commands });
			expect(claimsIssued).toHaveLength(3);
			expect(decided).toEqual([]);
			for (const command of commands)
				await consumeTrack({ ctx, command, claims });

			expect(claimsIssued).toHaveLength(3);
			expect(
				decided.map(({ commandId, value }) => `${commandId}:${value}`),
			).toEqual(["c1:1", "c2:0", "c3:1", "c3:0"]);
			expect(keys.owners.get(storageKeyOf("k1"))).toBe("r1");
			expect(keys.released).toEqual([storageKeyOf("k3")]);
		});

		test("a key the batch repeats is claimed in arrival order: the earlier item deducts, the later lands its seq only", async () => {
			const { ctx, decided } = createFixture();
			const first = keyed({ commandId: "c1", requestId: "r1", key: "k" });
			const second = keyed({ commandId: "c2", requestId: "r2", key: "k" });
			const claims = claimTrackBatch({
				ctx,
				commands: [first, second],
			});
			await consumeTrack({ ctx, command: first, claims });
			await consumeTrack({ ctx, command: second, claims });

			expect(
				decided.map(({ commandId, value }) => `${commandId}:${value}`),
			).toEqual(["c1:1", "c2:0"]);
		});

		test("one key's failed claim fails only its own track; the others still decide", async () => {
			const { ctx, decided } = createFixture();
			const claim = ctx.idempotencyKeys.claim;
			ctx.idempotencyKeys = {
				...ctx.idempotencyKeys,
				claim: async (params) => {
					if (params.storageKey === storageKeyOf("k2"))
						throw new Error("dynamo away");
					return claim(params);
				},
			};
			const commands = ["1", "2", "3"].map((n) =>
				keyed({ commandId: `c${n}`, requestId: `r${n}`, key: `k${n}` }),
			);
			const claims = claimTrackBatch({ ctx, commands });
			await consumeTrack({ ctx, command: commands[0] as TrackCommand, claims });
			await expect(
				consumeTrack({ ctx, command: commands[1] as TrackCommand, claims }),
			).rejects.toThrow("dynamo away");
			await consumeTrack({ ctx, command: commands[2] as TrackCommand, claims });

			expect(decided.map(({ commandId }) => commandId)).toEqual(["c1", "c3"]);
		});
	});
});
