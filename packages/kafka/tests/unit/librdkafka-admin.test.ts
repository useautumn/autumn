import { expect, test } from "bun:test";
import type { KafkaJS } from "@autumn/librdkafka";
import { createLibrdkafkaAdmin } from "../../src/client/librdkafka/admin/createLibrdkafkaAdmin.js";
import { createKafkaLog } from "../../src/client/librdkafka/kafkaLog.js";

/** A shim admin whose metadata shows the new topic only after a few reads, as a broker's does. */
function createLaggingShim({
	readsUntilVisible,
}: {
	readsUntilVisible: number;
}) {
	const calls: string[] = [];
	let metadataReads = 0;
	const admin = {
		createTopics: async () => {
			calls.push("create");
			return true;
		},
		fetchTopicMetadata: async ({ topics }: { topics: string[] }) => {
			metadataReads += 1;
			calls.push("metadata");
			if (metadataReads < readsUntilVisible)
				throw Object.assign(new Error("Broker: Unknown topic or partition"), {
					code: 3,
				});
			return topics.map((name) => ({
				name,
				partitions: [{ partitionId: 0, leader: 1, replicas: [1], isr: [1] }],
			}));
		},
	};
	const kafka = { admin: () => admin } as unknown as KafkaJS.Kafka;
	return { kafka, calls };
}

test("createTopics resolves only once every new topic has a leader, as kafkajs's waitForLeaders did", async () => {
	const shim = createLaggingShim({ readsUntilVisible: 3 });
	const admin = createLibrdkafkaAdmin({
		ctx: {
			kafka: shim.kafka,
			nativeClientConfig: {},
			createNative: () => {
				throw new Error("unused");
			},
			log: createKafkaLog({ clientId: "test" }),
		},
	});
	await admin.createTopics({
		topics: [{ topic: "owners", numPartitions: 1 }],
	});
	expect(shim.calls).toEqual(["create", "metadata", "metadata", "metadata"]);
});
