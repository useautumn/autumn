import { expect, test } from "bun:test";
import type { ConsumerConfig } from "kafkajs";
import { createOwnershipHandoffLink } from "../../../src/kafka/createOwnershipHandoffLink.js";

test("the ownership tail joins under the group prefix the worker's Kafka role allows", () => {
	const groupIds: string[] = [];
	const kafka = {
		producer: () => ({}) as never,
		consumer: (config: ConsumerConfig) => {
			groupIds.push(config.groupId);
			return {} as never;
		},
	};
	createOwnershipHandoffLink({
		ctx: { kafka },
		config: {
			topic: "balance-partition-owners",
			producerLimits: {
				retryCount: 1,
				initialRetryTimeMs: 1,
				maxRetryTimeMs: 1,
			},
		},
	});
	expect(groupIds).toHaveLength(1);
	// The worker's IAM policy grants ownership-log readers this prefix; the tail's own default is refused by the broker.
	expect(groupIds[0]).toStartWith("autumn-ownership-log-");
});
