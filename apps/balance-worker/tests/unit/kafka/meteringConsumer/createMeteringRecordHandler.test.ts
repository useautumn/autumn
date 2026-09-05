import { expect, test } from "bun:test";
import { InvalidRecordError } from "@autumn/kafka";
import { createMeteringRecordHandler } from "../../../../src/kafka/meteringConsumer/createMeteringRecordHandler.js";
import {
	KafkaPartitionInvariantError,
	StateBehindKafkaLogStartError,
} from "../../../../src/kafka/meteringConsumer/meteringErrors.js";
import {
	closeStoreFixture,
	createOutcome,
	createState,
	createStoreFixture,
	partition,
	topic,
} from "../kafka-test-fixtures.js";

function preservesSynchronousReadsAndApplications(): void {
	const fixture = createStoreFixture({ nextOffset: 3n });
	async function fetchTopicOffsets(): Promise<never> {
		throw new Error("No broker read expected");
	}
	const handler = createMeteringRecordHandler({
		ctx: { stateStore: fixture.store, partitionOffsets: { fetchTopicOffsets } },
	});
	try {
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 3n }),
		).toBeNull();
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 1n }),
		).toBe(3n);
		expect(
			handler.readResumeOffset({ topic, partition: 1, firstOffset: 0n }),
		).toBeNull();
		const state = createState();
		expect(
			handler.applyRecord({
				position: { topic, partition, offset: 3n },
				record: {
					schemaVersion: 1,
					type: "state_initialized",
					initializationId: "initial",
					initializedAt: 1_700_000_000_000,
					state,
				},
			}),
		).toBeUndefined();
		expect(fixture.store.readNextOffset({ topic, partition })).toBe(4n);
		const record = createOutcome({ state });
		expect(
			handler.applyRecord({
				position: { topic, partition, offset: 4n },
				record,
			}),
		).toBeUndefined();
		expect(
			fixture.store.readState({ identity: state.identity })?.revision,
		).toBe(1);
		expect(
			handler.applyRecord({
				position: { topic, partition, offset: 4n },
				record,
			}),
		).toEqual({ nextOffset: 5n });
	} finally {
		closeStoreFixture(fixture);
	}
}

async function readsRetentionOnlyWhenRewinding(): Promise<void> {
	const fixture = createStoreFixture({ nextOffset: 3n });
	const gate = Promise.withResolvers<void>();
	let low = "1";
	let brokerReads = 0;
	async function fetchTopicOffsets() {
		brokerReads++;
		await gate.promise;
		return [{ partition, offset: "8", high: "8", low }];
	}
	const handler = createMeteringRecordHandler({
		ctx: { stateStore: fixture.store, partitionOffsets: { fetchTopicOffsets } },
	});
	try {
		const resume = handler.readResumeOffset({
			topic,
			partition,
			firstOffset: 5n,
		});
		expect(resume).toBeInstanceOf(Promise);
		expect(brokerReads).toBe(1);
		expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
		gate.resolve();
		await expect(Promise.resolve(resume)).resolves.toBe(3n);
		low = "4";
		const lost = handler.readResumeOffset({
			topic,
			partition,
			firstOffset: 5n,
		});
		await expect(Promise.resolve(lost)).rejects.toBeInstanceOf(
			StateBehindKafkaLogStartError,
		);
		await expect(Promise.resolve(lost)).rejects.toMatchObject({
			retriable: false,
			storedNextOffset: 3n,
			logStartOffset: 4n,
		});
		expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
	} finally {
		gate.resolve();
		closeStoreFixture(fixture);
	}
}

function mapsOnlyPartitionInvariantErrors(): void {
	const fixture = createStoreFixture();
	async function fetchTopicOffsets() {
		return [];
	}
	const handler = createMeteringRecordHandler({
		ctx: { stateStore: fixture.store, partitionOffsets: { fetchTopicOffsets } },
	});
	const invariant = new InvalidRecordError();
	const ordinary = new Error("store disconnected");
	function throwInvariant(): never {
		if (!handler.onRecordError) throw new Error("Expected an error boundary");
		return handler.onRecordError({
			topic,
			partition,
			offset: "7",
			cause: invariant,
		});
	}
	function readOrdinaryFailure(): unknown {
		try {
			if (!handler.onRecordError) throw new Error("Expected an error boundary");
			handler.onRecordError({ topic, partition, offset: "7", cause: ordinary });
		} catch (cause) {
			return cause;
		}
	}
	try {
		expect(throwInvariant).toThrow(KafkaPartitionInvariantError);
		try {
			throwInvariant();
		} catch (cause) {
			expect(cause).toMatchObject({
				topic,
				partition,
				offset: "7",
				cause: invariant,
				retriable: false,
			});
		}
		expect(readOrdinaryFailure()).toBe(ordinary);
	} finally {
		closeStoreFixture(fixture);
	}
}

test(
	"metering handler preserves synchronous resume reads, applies, and writer-race offsets",
	preservesSynchronousReadsAndApplications,
);
test(
	"metering handler awaits retention only when rewinding behind the first fetched record",
	readsRetentionOnlyWhenRewinding,
);
test(
	"metering handler wraps known partition invariants and preserves other errors",
	mapsOnlyPartitionInvariantErrors,
);
