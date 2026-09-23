import { describe, expect, test } from "bun:test";
import type { ProducerRecord } from "kafkajs";
import {
	createCatalogInvalidationConsumer,
	createCatalogInvalidationPublisher,
	InvalidRecordError,
	parseCatalogInvalidationRecord,
	RecordKeyMismatchError,
	serializeCatalogInvalidationRecord,
} from "../../src/kafka.js";

const record = {
	schemaVersion: 1 as const,
	type: "invalidated" as const,
	orgId: "org_1",
	env: "live",
	at: 1_700_000_000_000,
};

describe("catalog invalidation topic", () => {
	test("a record round-trips, keyed by org and env", () => {
		const serialized = serializeCatalogInvalidationRecord({ record });

		expect(serialized.key.toString("utf8")).toBe("org_1:live");
		expect(parseCatalogInvalidationRecord(serialized)).toEqual(record);
	});

	test("a record under another key is refused", () => {
		const { value } = serializeCatalogInvalidationRecord({ record });

		expect(() =>
			parseCatalogInvalidationRecord({ key: Buffer.from("org_2:live"), value }),
		).toThrow(RecordKeyMismatchError);
	});

	test("an envelope of another type is refused", () => {
		const value = Buffer.from(
			JSON.stringify({ schemaVersion: 1, type: "claimed", payload: record }),
		);

		expect(() =>
			parseCatalogInvalidationRecord({ key: Buffer.from("org_1:live"), value }),
		).toThrow(InvalidRecordError);
	});

	test("the publisher sends one acknowledged message per invalidation", async () => {
		const sent: ProducerRecord[] = [];
		const publisher = createCatalogInvalidationPublisher({
			ctx: {
				topic: "local-catalog-invalidations",
				producer: {
					async send(producerRecord: ProducerRecord) {
						sent.push(producerRecord);
						return [];
					},
				},
			},
		});

		await publisher.publish({ orgId: "org_1", env: "live", at: record.at });

		expect(sent).toHaveLength(1);
		expect(sent[0]?.acks).toBe(-1);
		const [message] = sent[0]?.messages ?? [];
		expect(
			parseCatalogInvalidationRecord({
				key: message?.key as Buffer,
				value: message?.value as Buffer,
			}),
		).toEqual(record);
	});

	test("the consumer applies what it can read and skips what it cannot, in order", async () => {
		const applied: string[] = [];
		const skipped: string[] = [];
		let run:
			| ((payload: {
					message: { offset: string; key: Buffer | null; value: Buffer | null };
			  }) => Promise<void>)
			| undefined;
		const consumer = createCatalogInvalidationConsumer({
			ctx: {
				kafka: {
					consumer: () =>
						({
							connect: async () => {},
							subscribe: async () => {},
							run: async (config: { eachMessage?: typeof run }) => {
								run = config.eachMessage;
							},
							disconnect: async () => {},
						}) as never,
				},
				handler: {
					apply: ({ record: read }) => {
						applied.push(`${read.orgId}:${read.env}`);
					},
					skip: ({ offset }) => {
						skipped.push(offset);
					},
				},
			},
			config: { topic: "local-catalog-invalidations", groupIdPrefix: "test" },
		});

		await consumer.start();
		await run?.({
			message: {
				offset: "0",
				...serializeCatalogInvalidationRecord({ record }),
			},
		});
		await run?.({
			message: { offset: "1", key: null, value: Buffer.from("{") },
		});
		await run?.({
			message: {
				offset: "2",
				...serializeCatalogInvalidationRecord({
					record: { ...record, orgId: "org_2" },
				}),
			},
		});

		expect(applied).toEqual(["org_1:live", "org_2:live"]);
		expect(skipped).toEqual(["1"]);
	});
});
