import { describe, expect, test } from "bun:test";
import type {
	EvictCommand,
	ResetCommand,
	TrackCommand,
	UpdateBalanceCommand,
} from "@autumn/balance-engine";
import {
	meteringIdentityToPartitionKey,
	parseEvictCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import type { ProducerRecord } from "../../src/kafka.js";
import {
	type CommandRecord,
	createCommandPublisher,
	InvalidRecordError,
	parseCommandRecord,
	RecordKeyMismatchError,
	serializeCommandRecord,
} from "../../src/kafka.js";
import { testIdentity } from "../meteringFixtures.js";

const track: TrackCommand = parseTrackCommand({
	input: {
		schemaVersion: 1,
		type: "track",
		org: {
			config: {
				reverse_deduction_order: false,
				block_overdue_entitlements: false,
				include_past_due: true,
			},
		},
		commandId: "cmd_1",
		requestId: "req_1",
		identity: testIdentity,
		featureId: "messages",
		internalFeatureId: "feat_messages",
		value: 2,
		overageBehavior: "reject",
		properties: null,
		usageEvent: { name: "messages", idempotencyKey: null, id: null },
		occurredAt: 1_700_000_000_000,
	},
});

const evict: EvictCommand = parseEvictCommand({
	input: {
		schemaVersion: 1,
		type: "evict",
		requestId: "req_evict",
		identity: testIdentity,
		occurredAt: 1_700_000_000_000,
	},
});

const reset: ResetCommand = {
	schemaVersion: 1,
	type: "reset",
	org: track.org,
	commandId: "cmd_reset",
	requestId: "req_reset",
	identity: testIdentity,
	occurredAt: 1_700_000_000_000,
};

const updateBalance: UpdateBalanceCommand = {
	schemaVersion: 1,
	type: "updateBalance",
	org: track.org,
	commandId: "cmd_update",
	requestId: "req_update",
	identity: testIdentity,
	featureId: "messages",
	internalFeatureId: "feat_messages",
	addToBalance: 1,
	occurredAt: 1_700_000_000_000,
};

/** The command as a newer server sends it: with a field this build does not know. */
const fromNewerServer = <Command extends CommandRecord>(command: Command) =>
	({ ...command, futureField: true }) as Command;

describe("command topic", () => {
	test("a command round-trips, keyed like the metering log", () => {
		const serialized = serializeCommandRecord({ record: track });
		expect(serialized.key.toString("utf8")).toBe(
			meteringIdentityToPartitionKey({ identity: track.identity }),
		);
		expect(parseCommandRecord(serialized)).toEqual(track);
	});

	test("an evict rides the same topic under the customer's key", () => {
		const serialized = serializeCommandRecord({ record: evict });
		expect(serialized.key.toString("utf8")).toBe(
			meteringIdentityToPartitionKey({ identity: evict.identity }),
		);
		expect(parseCommandRecord(serialized)).toEqual(evict);
	});

	test("a queued command is read as sent: a newer server's fields are kept, absent optional ones stay absent", () => {
		for (const command of [track, reset, updateBalance, evict]) {
			for (const sent of [command, fromNewerServer(command)]) {
				expect(
					parseCommandRecord(serializeCommandRecord({ record: sent })),
				).toEqual(sent);
			}
		}
	});

	test("a payload without an identity, or of another type than its envelope, is invalid", () => {
		const { identity: _, ...anonymous } = track;
		for (const payload of [anonymous, { ...track, type: "reset" }, null]) {
			const value = Buffer.from(
				JSON.stringify({ schemaVersion: 1, type: "track", payload }),
			);
			expect(() =>
				parseCommandRecord({
					key: serializeCommandRecord({ record: track }).key,
					value,
				}),
			).toThrow(InvalidRecordError);
		}
	});

	test("a record with another command's key, or an unknown command type, is invalid", () => {
		const serialized = serializeCommandRecord({ record: track });
		expect(() =>
			parseCommandRecord({
				key: Buffer.from("other"),
				value: serialized.value,
			}),
		).toThrow(RecordKeyMismatchError);
		const unknown = Buffer.from(
			JSON.stringify({ schemaVersion: 1, type: "reset", payload: track }),
		);
		expect(() =>
			parseCommandRecord({ key: serialized.key, value: unknown }),
		).toThrow(InvalidRecordError);
	});

	test("the publisher sends a batch as one acknowledged request, one message per partition named", async () => {
		const sent: ProducerRecord[] = [];
		const publisher = createCommandPublisher({
			ctx: {
				producer: {
					send: async (record) => {
						sent.push(record);
						return [];
					},
				},
				topic: "local-commands",
			},
		});
		const other = { ...track, commandId: "cmd_2" };
		await publisher.append({
			records: [
				{ partition: 3, command: track },
				{ partition: 5, command: other },
			],
		});
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			topic: "local-commands",
			acks: -1,
		});
		expect(sent[0]?.messages.map((message) => message.partition)).toEqual([
			3, 5,
		]);
		expect(
			sent[0]?.messages.map((message) =>
				parseCommandRecord({
					key: message.key as Buffer,
					value: message.value as Buffer,
				}),
			),
		).toEqual([track, other]);
		await expect(publisher.append({ records: [] })).rejects.toThrow(RangeError);
	});

	describe("appends that arrive while a send is in flight", () => {
		/** A producer whose sends wait until the test releases them. */
		const createGatedProducer = () => {
			const sent: ProducerRecord[] = [];
			const gates: { release: () => void; fail: (error: Error) => void }[] = [];
			return {
				sent,
				releaseNext: () => gates.shift()?.release(),
				failNext: (error: Error) => gates.shift()?.fail(error),
				producer: {
					send: (record: ProducerRecord) => {
						sent.push(record);
						return new Promise<[]>((resolve, reject) =>
							gates.push({ release: () => resolve([]), fail: reject }),
						);
					},
				},
			};
		};
		const commandFor = (id: string) => ({ ...track, commandId: id });
		const commandIdsOf = (record: ProducerRecord | undefined) =>
			record?.messages.map(
				(message) =>
					(
						parseCommandRecord({
							key: message.key as Buffer,
							value: message.value as Buffer,
						}) as TrackCommand
					).commandId,
			);

		test("share the next send, in arrival order, and each resolves with it", async () => {
			const gated = createGatedProducer();
			const publisher = createCommandPublisher({
				ctx: { producer: gated.producer, topic: "local-commands" },
			});
			const first = publisher.append({
				records: [{ partition: 1, command: commandFor("a") }],
			});
			const waiting = ["b", "c", "d"].map((id) =>
				publisher.append({
					records: [{ partition: 2, command: commandFor(id) }],
				}),
			);
			await Bun.sleep(0);
			expect(gated.sent).toHaveLength(1);

			gated.releaseNext();
			await first;
			await Bun.sleep(0);
			expect(gated.sent).toHaveLength(2);
			expect(commandIdsOf(gated.sent[1])).toEqual(["b", "c", "d"]);

			gated.releaseNext();
			await Promise.all(waiting);
		});

		test("split by their bytes, so large commands never share a send past the broker's limit", async () => {
			const gated = createGatedProducer();
			const publisher = createCommandPublisher({
				ctx: { producer: gated.producer, topic: "local-commands" },
			});
			const large = (id: string) => ({
				...commandFor(id),
				properties: { blob: "x".repeat(300_000) },
			});
			const first = publisher.append({
				records: [{ partition: 1, command: commandFor("a") }],
			});
			const waiting = ["b", "c", "d"].map((id) =>
				publisher.append({ records: [{ partition: 2, command: large(id) }] }),
			);
			await Bun.sleep(0);

			gated.releaseNext();
			await first;
			await Bun.sleep(0);
			expect(commandIdsOf(gated.sent[1])).toEqual(["b", "c"]);
			gated.releaseNext();
			await Bun.sleep(0);
			expect(commandIdsOf(gated.sent[2])).toEqual(["d"]);
			gated.releaseNext();
			await Promise.all(waiting);
		});

		test("a failed send rejects only the appends it carried", async () => {
			const gated = createGatedProducer();
			const publisher = createCommandPublisher({
				ctx: { producer: gated.producer, topic: "local-commands" },
			});
			const first = publisher.append({
				records: [{ partition: 1, command: commandFor("a") }],
			});
			const second = publisher.append({
				records: [{ partition: 1, command: commandFor("b") }],
			});
			await Bun.sleep(0);
			gated.failNext(new Error("broker down"));
			await expect(first).rejects.toThrow("broker down");
			await Bun.sleep(0);
			gated.releaseNext();
			await second;
			expect(commandIdsOf(gated.sent[1])).toEqual(["b"]);
		});
	});
});
