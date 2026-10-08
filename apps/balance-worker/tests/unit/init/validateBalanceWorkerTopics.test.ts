import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { validateBalanceWorkerTopics } from "../../../src/init/workerConfig.js";

const env = createBalanceWorkerEnv({
	DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
	KAFKA_BROKERS: "127.0.0.1:19092",
	KAFKA_AUTH_MODE: "none",
});
const admin = ({
	count = env.BALANCE_WORKER_PARTITION_COUNT,
}: {
	count?: number;
} = {}) => ({
	fetchTopicMetadata: async () => ({
		topics: [
			{ name: env.BALANCE_WORKER_METERING_TOPIC, count },
			{ name: env.BALANCE_WORKER_OWNERSHIP_TOPIC, count },
			{ name: env.BALANCE_WORKER_COMMAND_TOPIC, count },
			{ name: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC, count: 1 },
		].map(({ name, count: partitionCount }) => ({
			name,
			partitions: Array.from({ length: partitionCount }, (_, partitionId) => ({
				partitionId,
				partitionErrorCode: 0,
				leader: 0,
				replicas: [0],
				isr: [0],
			})),
		})),
	}),
});
describe("balance worker topic validation", () => {
	test("accepts matching partitions; the ownership topic's cleanup policy is provisioning's to set", async () => {
		await expect(
			validateBalanceWorkerTopics({
				admin: admin(),
				env,
			}),
		).resolves.toBeUndefined();
	});
	test.each([{ count: 1 }, { count: 8 }])(
		"rejects unsafe topic layout %j",
		async (options) => {
			await expect(
				validateBalanceWorkerTopics({
					admin: admin(options),
					env,
				}),
			).rejects.toThrow();
		},
	);
});
