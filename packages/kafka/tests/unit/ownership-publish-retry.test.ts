import { expect, test } from "bun:test";
import type {
	KafkaProducer,
	KafkaTransaction,
} from "../../src/client/types/kafkaClient.js";
import { claimPartition } from "../../src/topics/ownership/publisher/claimPartition.js";
import { OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS } from "../../src/topics/ownership/publisher/ownershipPublishRetry.js";
import { releasePartition } from "../../src/topics/ownership/publisher/releasePartition.js";

const topic = "ownership";
const partition = 3;

/** A successor that announced `ready` waits this long for the predecessor's claim before claiming for itself. */
const HANDOFF_CLAIM_TIMEOUT_MS = 3_000;

function concurrentTransactions(): Error {
	return Object.assign(new Error("Broker: concurrent operation ongoing"), {
		code: 51,
		retriable: true,
	});
}

function createRefusingProducer({ refusals }: { refusals: number }) {
	const lifecycle: string[] = [];
	let remaining = refusals;
	function refuseOrPass(step: string): void {
		lifecycle.push(step);
		if (remaining > 0) {
			remaining -= 1;
			throw concurrentTransactions();
		}
	}
	async function transaction(): Promise<KafkaTransaction> {
		lifecycle.push("transaction");
		return {
			send: async () => {
				refuseOrPass("send");
				return [
					{ topicName: topic, partition, errorCode: 0, baseOffset: "77" },
				];
			},
			sendOffsets: async () => {},
			commit: async () => {
				lifecycle.push("commit");
			},
			abort: async () => {
				lifecycle.push("abort");
			},
		};
	}
	return { lifecycle, producer: { transaction } as KafkaProducer };
}

function createFastRetry({ deadlineMs }: { deadlineMs: number }) {
	let tick = 0;
	return {
		deadlineMs,
		backoffMs: 1,
		now: () => tick,
		sleep: async (ms: number) => {
			tick += ms;
		},
	};
}

test("a claim refused by the coordinator is retried and lands with its offset as the route epoch", async () => {
	const fake = createRefusingProducer({ refusals: 1 });
	const published = await claimPartition({
		ctx: { producer: fake.producer, retry: createFastRetry({ deadlineMs: 3 }) },
		topic,
		partition,
		endpoint: "http://10.0.0.1:8082",
		claimedAt: 1,
	});
	expect(published.routeEpoch).toBe("77");
	expect(fake.lifecycle).toEqual([
		"transaction",
		"send",
		"abort",
		"transaction",
		"send",
		"commit",
	]);
});

test("a release honours the same retry", async () => {
	const fake = createRefusingProducer({ refusals: 1 });
	await releasePartition({
		ctx: { producer: fake.producer, retry: createFastRetry({ deadlineMs: 3 }) },
		topic,
		partition,
		endpoint: "http://10.0.0.1:8082",
		releasedAt: 2,
	});
	expect(fake.lifecycle.filter((step) => step === "transaction")).toHaveLength(
		2,
	);
});

test("by default a claim gives up well inside the successor's claim wait", () => {
	expect(OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS).toBeLessThan(
		HANDOFF_CLAIM_TIMEOUT_MS,
	);
	expect(OWNERSHIP_PUBLISH_RETRY_DEADLINE_MS).toBeGreaterThan(0);
});
