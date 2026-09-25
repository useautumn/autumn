import { expect, test } from "bun:test";
import { createRequire } from "node:module";

// kafkajs 2.2.4 sends FindCoordinator before every AddPartitionsToTxn,
// AddOffsetsToTxn and EndTxn, so a one-send transaction was five broker round
// trips instead of three. Patched in patches/kafkajs@2.2.4.patch to keep the
// coordinator until a request to it fails for a reason other than
// CONCURRENT_TRANSACTIONS.
const require = createRequire(import.meta.resolve("kafkajs"));
const createEosManager = require("./src/producer/eosManager/index.js");

function createFixture() {
	const lookups: number[] = [];
	const failures: { type: string }[] = [];
	const broker = {
		initProducerId: async () => ({ producerId: 7, producerEpoch: 1 }),
		addPartitionsToTxn: async () => {
			const failure = failures.shift();
			if (failure) throw Object.assign(new Error(failure.type), failure);
		},
		endTxn: async () => {},
	};
	const cluster = {
		retry: { retries: 0 },
		refreshMetadataIfNecessary: async () => {},
		findGroupCoordinator: async () => {
			lookups.push(1);
			return broker;
		},
	};
	const manager = createEosManager({
		logger: { debug() {}, info() {}, warn() {}, error() {} },
		cluster,
		transactional: true,
		transactionalId: "autumn-balance-worker:test:events:3",
	});
	async function commitOne(): Promise<void> {
		await manager.beginTransaction();
		await manager.addPartitionsToTransaction([
			{ topic: "events", partitions: [{ partition: 3 }] },
		]);
		await manager.commit();
	}
	return { manager, lookups, failures, commitOne };
}

test("a transaction reuses the coordinator it already found", async () => {
	const { manager, lookups, commitOne } = createFixture();
	await manager.initProducerId();
	await commitOne();
	await commitOne();
	expect(lookups).toHaveLength(1);
});

test("a coordinator error forgets it, a busy coordinator does not", async () => {
	const { manager, lookups, failures, commitOne } = createFixture();
	await manager.initProducerId();

	failures.push({ type: "CONCURRENT_TRANSACTIONS" });
	await expect(commitOne()).rejects.toThrow("CONCURRENT_TRANSACTIONS");
	expect(lookups).toHaveLength(1);

	await manager.abort().catch(() => {});
	failures.push({ type: "NOT_COORDINATOR" });
	await expect(commitOne()).rejects.toThrow("NOT_COORDINATOR");
	await manager.abort().catch(() => {});
	await commitOne();
	expect(lookups).toHaveLength(2);
});
