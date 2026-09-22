import { expect, spyOn, test } from "bun:test";
import type { OwnershipConsumer } from "@autumn/kafka";
import * as kafkaPackage from "@autumn/kafka";
import type { ProducerRecord } from "kafkajs";
import {
	type BalanceWorkerKafka,
	createBalanceWorkerKafka,
	createKafkaBalanceWorkerClient,
} from "../src/balanceWorkerClient.js";

const owner = { partition: 0, routeEpoch: "1", endpoint: "http://worker-a" };

function createFakeKafka({
	startFailures = 0,
	connectFailure,
}: {
	startFailures?: number;
	connectFailure?: Error;
} = {}) {
	const events: string[] = [];
	const sent: ProducerRecord[] = [];
	let consumersBuilt = 0;
	function consumerStub(): OwnershipConsumer {
		const index = ++consumersBuilt;
		return {
			start: async () => {
				events.push(`start:${index}`);
				if (index <= startFailures) throw new Error(`boom ${index}`);
			},
			stop: async () => {
				events.push(`stop:${index}`);
			},
			findOwner: () => owner,
			refresh: async () => {
				events.push(`refresh:${index}`);
			},
		};
	}
	const createConsumer = spyOn(
		kafkaPackage,
		"createOwnershipConsumer",
	).mockImplementation(consumerStub);
	const kafka: BalanceWorkerKafka = {
		consumer: () => {
			throw new Error("The stubbed ownership consumer never asks for one");
		},
		admin: () => {
			throw new Error("The stubbed ownership consumer never asks for one");
		},
		producer: () => ({
			connect: async () => {
				events.push("producer:connect");
				if (connectFailure) throw connectFailure;
			},
			disconnect: async () => {
				events.push("producer:disconnect");
			},
			send: async (record) => {
				sent.push(record);
				return [];
			},
		}),
	};
	const logs: string[] = [];
	const log = (payload: object | string, message?: string) => {
		logs.push(message ?? String(payload));
	};
	const client = createKafkaBalanceWorkerClient({
		ctx: { kafka, logger: { info: log, warn: log, error: log } },
		config: {
			kafka: {
				clientId: "test",
				brokers: ["127.0.0.1:19092"],
				authMode: "none",
			},
			ownershipTopic: "local-ownership",
			commandTopic: "local-commands",
			groupIdPrefix: "test-owners",
			partitionCount: 1,
			timeoutMs: 1_000,
			startRetryDelaysMs: [1],
		},
	});
	return { client, events, sent, logs, createConsumer };
}

const command = {
	schemaVersion: 1 as const,
	type: "track" as const,
	org: {
		config: {
			reverse_deduction_order: false,
			block_overdue_entitlements: false,
			include_past_due: true,
		},
	},
	commandId: "cmd_1",
	requestId: "req_1",
	identity: { orgId: "org", env: "sandbox", customerId: "a", entityId: null },
	featureId: "messages",
	internalFeatureId: "feat_messages",
	value: 1,
	overageBehavior: "reject" as const,
	properties: null,
	occurredAt: 0,
};

test("owners answer nothing until the ownership log is read through; start retries and stops each failed consumer", async () => {
	const fixture = createFakeKafka({ startFailures: 2 });
	try {
		expect(fixture.client.track).toBeDefined();
		await fixture.client.start();
		expect(fixture.events).toEqual([
			"start:1",
			"stop:1",
			"start:2",
			"stop:2",
			"start:3",
		]);
		expect(fixture.createConsumer.mock.calls[0]?.[0].config).toEqual({
			topic: "local-ownership",
			groupIdPrefix: "test-owners",
			catchUpTimeoutMs: undefined,
		});
		expect(fixture.logs.at(-1)).toMatch(/ready; initial catch-up complete/);
		await fixture.client.stop();
		expect(fixture.events.at(-1)).toBe("stop:3");
	} finally {
		fixture.createConsumer.mockRestore();
	}
});

test("the producer connects on the first queued command only, and a failed connect is retried next time", async () => {
	const failing = createFakeKafka({ connectFailure: new Error("no broker") });
	try {
		await failing.client.start();
		await expect(
			failing.client.queue.track({ commands: [command] }),
		).rejects.toThrow("no broker");
		await expect(
			failing.client.queue.track({ commands: [command] }),
		).rejects.toThrow("no broker");
		expect(
			failing.events.filter((event) => event === "producer:connect"),
		).toHaveLength(2);
		await failing.client.stop();
		expect(failing.events).not.toContain("producer:disconnect");
	} finally {
		failing.createConsumer.mockRestore();
	}

	const fixture = createFakeKafka();
	try {
		await fixture.client.start();
		expect(fixture.events).not.toContain("producer:connect");
		await fixture.client.queue.track({ commands: [command] });
		await fixture.client.queue.track({ commands: [command] });
		expect(
			fixture.events.filter((event) => event === "producer:connect"),
		).toHaveLength(1);
		expect(fixture.sent).toHaveLength(2);
		expect(fixture.sent[0]).toMatchObject({ topic: "local-commands" });
		await fixture.client.stop();
		expect(fixture.events.at(-1)).toBe("producer:disconnect");
	} finally {
		fixture.createConsumer.mockRestore();
	}
});

test("a connection is built without connecting, with MSK IAM transport when asked", () => {
	const plain = createBalanceWorkerKafka({
		clientId: "test",
		brokers: ["127.0.0.1:19092"],
		authMode: "none",
	});
	expect(typeof plain.producer).toBe("function");
	expect(() =>
		createBalanceWorkerKafka({
			clientId: "test",
			brokers: ["broker:9098"],
			authMode: "msk_iam",
		}),
	).toThrow("MSK IAM authentication requires a region");
});
