import { describe, expect, test } from "bun:test";
import type { EvictCommand, TrackCommand } from "@autumn/balance-engine";
import {
	meteringIdentityToPartitionKey,
	parseEvictCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { CompressionTypes, type ProducerRecord } from "kafkajs";
import {
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
		usageEvent: { name: "messages" },
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
			compression: CompressionTypes.GZIP,
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
});
