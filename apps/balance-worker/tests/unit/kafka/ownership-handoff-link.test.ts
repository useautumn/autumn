import { describe, expect, test } from "bun:test";
import type { ConsumerConfig, Kafka, Producer } from "kafkajs";
import { createOwnershipHandoffLink } from "../../../src/kafka/createOwnershipHandoffLink.js";

const limits = { retryCount: 1, initialRetryTimeMs: 1, maxRetryTimeMs: 1 };

function createFakeKafka({ tailFails }: { tailFails: boolean }) {
	const lifecycle: string[] = [];
	const producer = {
		connect: async () => {
			lifecycle.push("sender:connect");
		},
		disconnect: async () => {
			lifecycle.push("sender:disconnect");
		},
		send: async () => [],
	} as unknown as Producer;
	const consumer = {
		connect: async () => {
			lifecycle.push("tail:connect");
			if (tailFails) throw new Error("broker unreachable");
		},
		subscribe: async () => undefined,
		run: async () => undefined,
		stop: async () => undefined,
		disconnect: async () => {
			lifecycle.push("tail:disconnect");
		},
		on: () => () => undefined,
		events: { CRASH: "crash", FETCH: "fetch" },
	};
	const kafka = {
		producer: () => producer,
		consumer: () => consumer,
	} as unknown as Pick<Kafka, "producer" | "consumer">;
	return { kafka, lifecycle };
}

describe("ownership handoff link", () => {
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
			config: { topic: "balance-partition-owners", producerLimits: limits },
		});
		expect(groupIds).toHaveLength(1);
		// The worker's IAM policy grants ownership-log readers this prefix; the tail's own default is refused by the broker.
		expect(groupIds[0]).toStartWith("autumn-ownership-log-");
	});

	test("a tail that fails to start leaves no connected sender behind", async () => {
		const { kafka, lifecycle } = createFakeKafka({ tailFails: true });
		const link = createOwnershipHandoffLink({
			ctx: { kafka },
			config: { topic: "owners", producerLimits: limits },
		});
		await expect(link.start()).rejects.toThrow("broker unreachable");
		expect(lifecycle).toEqual([
			"sender:connect",
			"tail:connect",
			"tail:disconnect",
			"sender:disconnect",
		]);
	});
});
