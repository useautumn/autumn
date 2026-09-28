import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { serializeMeteringRecord } from "@autumn/kafka";
import type { EachBatchPayload, Kafka } from "kafkajs";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createStreamConsumer } from "../../../src/stream/createStreamConsumer.js";
import type { StreamConsumer } from "../../../src/stream/types/streamConsumer.js";

const trackMessage = ({ offset }: { offset: string }) => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
	});
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: createCatalogFor({ state }),
		}),
		command: createTrackCommand({ value: 3 }),
	});
	const record = { ...mutation, receipt: { fingerprint: "f", expiresAt: 1 } };
	return { offset, ...serializeMeteringRecord({ record }) };
};

/** A kafkajs stand-in that records resolved offsets, auto-resolving a returned batch the way kafkajs does. */
const createFakeKafka = () => {
	let eachBatch: ((payload: EachBatchPayload) => Promise<void>) | undefined;
	let autoResolve = true;
	const resolved: string[] = [];
	const kafka = {
		consumer: () => ({
			connect: async () => {},
			subscribe: async () => {},
			run: async (config: {
				eachBatch: typeof eachBatch;
				eachBatchAutoResolve?: boolean;
			}) => {
				eachBatch = config.eachBatch;
				autoResolve = config.eachBatchAutoResolve ?? true;
			},
			disconnect: async () => {},
		}),
	} as unknown as Kafka;
	const deliver = async ({ offsets }: { offsets: string[] }) => {
		const messages = offsets.map((offset) => trackMessage({ offset }));
		const lastOffset = offsets.at(-1) ?? "";
		await eachBatch?.({
			batch: {
				topic: "local-events",
				partition: 0,
				messages,
				lastOffset: () => lastOffset,
			},
			heartbeat: async () => {},
			resolveOffset: (offset: string) => {
				resolved.push(offset);
			},
		} as unknown as EachBatchPayload);
		if (autoResolve) resolved.push(lastOffset);
	};
	return { kafka, deliver, resolved };
};

const logger = { info: () => {}, warn: () => {}, error: () => {} };

const startConsumer = async ({ job }: { job: StreamConsumer }) => {
	const fake = createFakeKafka();
	const consumer = createStreamConsumer({
		ctx: { kafka: fake.kafka, logger: logger as never },
		config: { topic: "local-events", groupIdPrefix: "herald" },
		streamConsumer: job,
	});
	await consumer.start();
	return { ...fake, consumer };
};

test("a landed batch resolves its last offset", async () => {
	const { deliver, resolved } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
	});

	await deliver({ offsets: ["4", "5"] });

	expect(resolved).toEqual(["5"]);
});

test("a batch herald stops while the store is down is left unresolved, so it is never committed", async () => {
	let stop: () => Promise<void> = async () => {};
	const { deliver, resolved, consumer } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async () => {
				await stop();
				throw Object.assign(new Error("connection reset"), { errno: "08006" });
			},
		},
	});
	stop = consumer.stop;

	await deliver({ offsets: ["4", "5"] });

	expect(resolved).toEqual([]);
});
