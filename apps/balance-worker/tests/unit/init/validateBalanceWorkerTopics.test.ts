import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { validateBalanceWorkerTopics } from "../../../src/init/workerConfig.js";

const env = createBalanceWorkerEnv({
	KAFKA_BROKERS: "127.0.0.1:19092",
	BALANCE_WORKER_PARTITION_COUNT: "2",
});
const admin = ({
	count = 2,
	policy = "compact",
}: {
	count?: number;
	policy?: string;
} = {}) => ({
	fetchTopicMetadata: async () => ({
		topics: [
			env.BALANCE_WORKER_METERING_TOPIC,
			env.BALANCE_WORKER_OWNERSHIP_TOPIC,
		].map((name) => ({
			name,
			partitions: Array.from({ length: count }, (_, partitionId) => ({
				partitionId,
				partitionErrorCode: 0,
				leader: 0,
				replicas: [0],
				isr: [0],
			})),
		})),
	}),
	describeConfigs: async () => ({
		throttleTime: 0,
		resources: [
			{
				errorCode: 0,
				errorMessage: "",
				resourceName: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
				resourceType: 2,
				configEntries: [
					{
						configName: "cleanup.policy",
						configValue: policy,
						readOnly: false,
						isDefault: false,
						isSensitive: false,
						configSource: 1,
						configSynonyms: [],
					},
				],
			},
		],
	}),
});
describe("balance worker topic validation", () => {
	test("accepts matching partitions and compact-only ownership", async () => {
		await expect(
			validateBalanceWorkerTopics({
				admin: admin(),
				env,
			}),
		).resolves.toBeUndefined();
	});
	test.each([{ count: 1 }, { policy: "compact,delete" }, { policy: "delete" }])(
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
