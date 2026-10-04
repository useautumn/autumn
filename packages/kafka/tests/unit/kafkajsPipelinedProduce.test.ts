import { expect, test } from "bun:test";
import { createRequire } from "node:module";

// kafkajs 2.2.4 holds its per-broker idempotence lock for the whole produce round trip, so one
// producer never has two batches on the wire. Patched in patches/kafkajs@2.2.4.patch: with
// `pipelined`, the lock is released once the request is queued on the connection (its wire order,
// and so its sequence order, is fixed) and the response is awaited outside it. A failure that
// cannot roll its sequence back, because a later batch already took the next one, poisons the
// producer instead of handing two batches the same sequence.
const require = createRequire(import.meta.resolve("kafkajs"));
const createEosManager = require("./src/producer/eosManager/index.js");
const createSendMessages = require("./src/producer/sendMessages.js");
const createRetry = require("./src/retry/index.js");

type Produce = {
	topicData: {
		topic: string;
		partitions: {
			partition: number;
			firstSequence: number;
			messages: unknown[];
		}[];
	}[];
	onRequestQueued?: () => void;
	settle: (outcome: { ok: true } | { ok: false; error: Error }) => void;
};

function createFixture({
	pipelined,
	retries = 0,
}: {
	pipelined: boolean;
	retries?: number;
}) {
	const produces: Produce[] = [];
	let metadataFailures = 0;
	const broker = {
		nodeId: 1,
		initProducerId: async () => ({ producerId: 7, producerEpoch: 0 }),
		produce: (request: Omit<Produce, "settle">) =>
			new Promise<unknown>((resolve, reject) => {
				produces.push({
					...request,
					settle: (outcome) =>
						outcome.ok
							? resolve({
									topics: [
										{
											topicName: "events",
											partitions: [
												{ partition: 0, errorCode: 0, baseOffset: "0" },
											],
										},
									],
								})
							: reject(outcome.error),
				});
			}),
	};
	const cluster = {
		retry: { retries: 0 },
		refreshMetadataIfNecessary: async () => {
			if (metadataFailures-- > 0)
				throw Object.assign(new Error("metadata not loaded"), {
					name: "KafkaJSMetadataNotLoaded",
					retriable: true,
				});
		},
		refreshMetadata: async () => {},
		findControllerBroker: async () => broker,
		findTopicPartitionMetadata: () => [{ partitionId: 0, leader: 1 }],
		findLeaderForPartitions: () => ({ 1: [0] }),
		findBroker: async () => broker,
		addMultipleTargetTopics: async () => {},
		isConnected: () => true,
	};
	const logger = {
		debug() {},
		info() {},
		warn() {},
		error() {},
		namespace: () => logger,
	};
	const eosManager = createEosManager({
		logger,
		cluster,
		transactional: false,
	});
	const sendMessages = createSendMessages({
		logger,
		cluster,
		partitioner: () => 0,
		eosManager,
		retrier: createRetry({
			retries,
			initialRetryTime: 1,
			maxRetryTime: 2,
			factor: 0,
		}),
		pipelined,
	});
	function send({ count }: { count: number }) {
		return sendMessages({
			acks: -1,
			timeout: 1000,
			compression: 0,
			topicMessages: [
				{
					topic: "events",
					messages: Array.from({ length: count }, (_, i) => ({
						key: `k${i}`,
						value: "v",
					})),
				},
			],
		});
	}
	/** The next metadata refreshes fail retriably, before any lock is taken. */
	function failNextMetadataRefreshes({ count }: { count: number }) {
		metadataFailures = count;
	}
	return { eosManager, produces, send, failNextMetadataRefreshes };
}

const turns = async (count = 3) => {
	for (let i = 0; i < count; i++)
		await new Promise<void>((resolve) => setImmediate(resolve));
};

test("pipelined: the second batch reaches the broker before the first is answered, with the next sequence", async () => {
	const { eosManager, produces, send } = createFixture({ pipelined: true });
	await eosManager.initProducerId();
	const first = send({ count: 3 });
	await turns();
	expect(produces).toHaveLength(1);
	// The request is on the wire; releasing the lock here is what lets the next batch go.
	produces[0]?.onRequestQueued?.();
	const second = send({ count: 2 });
	await turns();
	expect(produces).toHaveLength(2);
	expect(
		produces.map((p) => p.topicData[0]?.partitions[0]?.firstSequence),
	).toEqual([0, 3]);
	produces[1]?.onRequestQueued?.();
	produces[0]?.settle({ ok: true });
	produces[1]?.settle({ ok: true });
	await Promise.all([first, second]);
	expect(eosManager.getSequence("events", 0)).toBe(5);
});

test("unpatched behaviour: without pipelining the second batch waits for the first response", async () => {
	const { eosManager, produces, send } = createFixture({ pipelined: false });
	await eosManager.initProducerId();
	const first = send({ count: 3 });
	await turns();
	expect(produces).toHaveLength(1);
	expect(produces[0]?.onRequestQueued).toBeUndefined();
	const second = send({ count: 2 });
	await turns();
	expect(produces).toHaveLength(1);
	produces[0]?.settle({ ok: true });
	await first;
	await turns();
	expect(produces).toHaveLength(2);
	produces[1]?.settle({ ok: true });
	await second;
});

test("a failure with a later batch already sequenced poisons the producer; the later batch keeps its own verdict", async () => {
	const { eosManager, produces, send } = createFixture({ pipelined: true });
	await eosManager.initProducerId();
	const first = send({ count: 3 });
	await turns();
	produces[0]?.onRequestQueued?.();
	const second = send({ count: 2 });
	await turns();
	produces[1]?.onRequestQueued?.();
	const refused = Object.assign(new Error("NOT_ENOUGH_REPLICAS"), {
		retriable: false,
	});
	produces[0]?.settle({ ok: false, error: refused });
	const firstFailure = await first.catch((cause: Error) => cause);
	expect(firstFailure.message).toContain("must be recreated");
	// Not rolled back: the next sequence stays where the second batch left it.
	expect(eosManager.getSequence("events", 0)).toBe(5);
	await expect(send({ count: 1 })).rejects.toThrow("must be recreated");
	produces[1]?.settle({ ok: true });
	await second;
});

test("a failure with nothing sequenced after it rolls the sequence back, as unpatched kafkajs does", async () => {
	const { eosManager, produces, send } = createFixture({ pipelined: true });
	await eosManager.initProducerId();
	const first = send({ count: 3 });
	await turns();
	produces[0]?.onRequestQueued?.();
	const refused = Object.assign(new Error("INVALID_RECORD"), {
		retriable: false,
	});
	produces[0]?.settle({ ok: false, error: refused });
	await expect(first).rejects.toThrow("INVALID_RECORD");
	expect(eosManager.getSequence("events", 0)).toBe(0);
	const second = send({ count: 1 });
	await turns();
	expect(produces[1]?.topicData[0]?.partitions[0]?.firstSequence).toBe(0);
	produces[1]?.settle({ ok: true });
	await second;
});

test("a send delayed before the lock by a retriable failure still sequences in call order", async () => {
	const { eosManager, produces, send, failNextMetadataRefreshes } =
		createFixture({
			pipelined: true,
			retries: 2,
		});
	await eosManager.initProducerId();
	// The first send's metadata refresh fails and is retried after a backoff; the others see fresh metadata at once.
	failNextMetadataRefreshes({ count: 1 });
	const sends = [send({ count: 3 }), send({ count: 1 }), send({ count: 4 })];
	await new Promise<void>((resolve) => setTimeout(resolve, 20));
	expect(produces).toHaveLength(1);
	expect(produces[0]?.topicData[0]?.partitions[0]?.messages).toHaveLength(3);
	produces[0]?.onRequestQueued?.();
	await turns();
	expect(
		produces.map((p) => p.topicData[0]?.partitions[0]?.messages.length),
	).toEqual([3, 1]);
	produces[1]?.onRequestQueued?.();
	await turns();
	expect(
		produces.map((p) => p.topicData[0]?.partitions[0]?.firstSequence),
	).toEqual([0, 3, 4]);
	for (const produce of produces) produce.settle({ ok: true });
	await Promise.all(sends);
});

test("a rolled-back batch retries ahead of a send issued meanwhile", async () => {
	const { eosManager, produces, send } = createFixture({
		pipelined: true,
		retries: 2,
	});
	await eosManager.initProducerId();
	const first = send({ count: 3 });
	await turns();
	produces[0]?.onRequestQueued?.();
	const transient = Object.assign(new Error("NOT_LEADER_OR_FOLLOWER"), {
		retriable: true,
	});
	produces[0]?.settle({ ok: false, error: transient });
	await turns();
	// Issued during the first batch's retry backoff: it must not take the rolled-back sequence.
	const second = send({ count: 2 });
	await new Promise<void>((resolve) => setTimeout(resolve, 20));
	expect(
		produces.map((p) => [
			p.topicData[0]?.partitions[0]?.firstSequence,
			p.topicData[0]?.partitions[0]?.messages.length,
		]),
	).toEqual([
		[0, 3],
		[0, 3],
	]);
	produces[1]?.onRequestQueued?.();
	await turns();
	expect(produces[2]?.topicData[0]?.partitions[0]?.firstSequence).toBe(3);
	produces[1]?.settle({ ok: true });
	produces[2]?.settle({ ok: true });
	await Promise.all([first, second]);
});
