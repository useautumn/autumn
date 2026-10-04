/**
 * Small batches go to Kafka uncompressed. A consumer must read an uncompressed batch exactly as it reads a
 * gzipped one: every record's key and value round-trip through the batch encoding kafkajs consumers decode.
 */

import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { CompressionTypes } from "kafkajs";
import {
	compressionFor,
	GZIP_MIN_RECORDS_PER_BATCH,
} from "../../src/producer/compressionFor.js";

const require = createRequire(import.meta.url);
const protocol = require
	.resolve("kafkajs")
	.replace(/index\.js$/, "src/protocol/");
const { RecordBatch } = require(`${protocol}recordBatch/v0/index.js`);
const Record = require(`${protocol}recordBatch/record/v0/index.js`);
const decodeRecordBatch = require(`${protocol}recordBatch/v0/decoder.js`);
const Decoder = require(`${protocol}decoder.js`);

const messagesOf = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		key: Buffer.from(`["org_1","sandbox","cus_${index}"]`),
		value: Buffer.from(
			JSON.stringify({
				schemaVersion: 1,
				type: "mutation",
				payload: { index },
			}),
		),
	}));

/** The batch a send of `messages` puts on the wire, decoded the way a fetch decodes it. */
const roundTrip = async (messages: ReturnType<typeof messagesOf>) => {
	const encoded = await RecordBatch({
		compression: compressionFor({ records: messages.length }),
		lastOffsetDelta: messages.length - 1,
		records: messages.map((message, offsetDelta) =>
			Record({ offsetDelta, ...message }),
		),
	});
	const batch = await decodeRecordBatch(new Decoder(encoded.buffer));
	return batch.records.map((record: { key: Buffer; value: Buffer }) => ({
		key: record.key,
		value: record.value,
	}));
};

describe("produce compression", () => {
	test("gzip only once a partition batch holds enough records to share its cost", () => {
		expect(compressionFor({ records: 1 })).toBe(CompressionTypes.None);
		expect(compressionFor({ records: GZIP_MIN_RECORDS_PER_BATCH - 1 })).toBe(
			CompressionTypes.None,
		);
		expect(compressionFor({ records: GZIP_MIN_RECORDS_PER_BATCH })).toBe(
			CompressionTypes.GZIP,
		);
		expect(
			compressionFor({ records: GZIP_MIN_RECORDS_PER_BATCH, partitions: 2 }),
		).toBe(CompressionTypes.None);
	});

	for (const count of [1, 4, GZIP_MIN_RECORDS_PER_BATCH, 20])
		test(`a batch of ${count} reads back record for record`, async () => {
			const messages = messagesOf(count);
			expect(await roundTrip(messages)).toEqual(messages);
		});
});
