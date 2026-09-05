import { describe, expect, test } from "bun:test";
import type { KafkaTransaction } from "@autumn/kafka";
import { createOwnershipPublisher } from "../../../src/kafka/createOwnershipPublisher.js";
import { createWorkerProducerFixture } from "./createWorkerProducerFixture.js";

const deferred = () => {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
};
const fixture = ({
	commitFailure,
	sendFailure,
	metadataPartitions = [2],
}: {
	commitFailure?: Error;
	sendFailure?: Error;
	metadataPartitions?: number[];
} = {}) => {
	const events: string[] = [];
	let offset = 10;
	const producer = {
		connect: async () => {
			events.push("connect");
		},
		disconnect: async () => {
			events.push("disconnect");
		},
		transaction: async (): Promise<KafkaTransaction> => {
			events.push("transaction");
			return {
				send: async ({ topic, messages }) => {
					events.push(`send:${topic}:${messages[0]?.partition}`);
					if (sendFailure) throw sendFailure;
					return [
						{
							topicName: topic,
							partition: 2,
							errorCode: 0,
							baseOffset: String(offset++),
						},
					];
				},
				commit: async () => {
					events.push("commit");
					if (commitFailure) throw commitFailure;
				},
				abort: async () => {
					events.push("abort");
				},
			};
		},
	};
	const session = createWorkerProducerFixture({
		producer,
		topic: "metering",
		partition: 2,
	});
	const publication = createOwnershipPublisher({
		ctx: {
			session,
			partitionOffsets: {
				fetchTopicOffsets: async () =>
					metadataPartitions.map((partition) => ({
						partition,
						offset: "0",
						high: "0",
						low: "0",
					})),
			},
		},
		config: { topic: "owners", partition: 2, endpoint: "http://worker.test" },
	});
	return { session, publication, events };
};

describe("Partition ownership producer session", () => {
	test("cleanup never initializes or reconnects an unused session", async () => {
		const f = fixture();
		await f.publication.release();
		expect(f.events).toEqual([]);
		await expect(f.publication.claim()).rejects.toThrow("initialized");
		expect(f.events).toEqual([]);
	});
	test("claims nonzero partition with decimal ownership offset and validates metadata", async () => {
		const f = fixture();
		await f.session.connect();
		await f.session.fence();
		expect(await f.publication.claim()).toEqual({ routeEpoch: "10" });
		expect(f.events).toContain("send:owners:2");
		await f.publication.release();
		await f.session.disconnect();
		expect(f.events.at(-1)).toBe("disconnect");
		const missing = fixture({ metadataPartitions: [0] });
		await missing.session.connect();
		await missing.session.fence();
		await expect(missing.publication.claim()).rejects.toThrow(
			"must contain metering partition 2",
		);
		expect(missing.events).not.toContain("send:owners:2");
	});
	test("serializes whole transactions rather than individual requests", async () => {
		const f = fixture();
		await f.session.connect();
		await f.session.fence();
		const append = await f.session.transaction();
		const claim = f.publication.claim();
		await Bun.sleep(1);
		expect(f.events.filter((event) => event === "transaction")).toHaveLength(2);
		await append.commit();
		await claim;
		expect(f.events.filter((event) => event === "transaction")).toHaveLength(3);
	});
	for (const failure of ["ambiguous", "fenced"]) {
		test(`${failure} claim permanently disables cleanup transactions`, async () => {
			const f = fixture(
				failure === "ambiguous"
					? { commitFailure: new Error("unknown") }
					: {
							sendFailure: Object.assign(new Error("fenced"), { code: 47 }),
						},
			);
			await f.session.connect();
			await f.session.fence();
			await expect(f.publication.claim()).rejects.toBeDefined();
			const before = f.events.length;
			await f.publication.release();
			expect(f.events).toHaveLength(before);
			expect(f.session.isUsable()).toBe(false);
			await expect(f.session.connect()).rejects.toThrow("reconnect");
		});
	}
	test("disconnect waits for an outstanding claim transaction", async () => {
		const f = fixture();
		await f.session.connect();
		await f.session.fence();
		const transaction = await f.session.transaction();
		const gate = deferred();
		const commit = gate.promise.then(() => transaction.commit());
		const disconnect = f.session.disconnect({ waitForTransactions: true });
		await Bun.sleep(1);
		expect(f.events).not.toContain("disconnect");
		gate.resolve();
		await commit;
		await disconnect;
		expect(f.events.at(-1)).toBe("disconnect");
	});
});
