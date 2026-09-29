import { expect, test } from "bun:test";
import { Kafka, logLevel } from "kafkajs";
import {
	createCatalogInvalidationConsumer,
	createCatalogInvalidationPublisher,
	createIdempotentProducerConfig,
	createKafkaClient,
} from "../../src/kafka.js";

if (!process.env.KAFKA_BROKERS?.trim()) {
	throw new Error(
		"KAFKA_BROKERS is required; run bun run test:kafka to reuse the development broker",
	);
}
const brokers = process.env.KAFKA_BROKERS.split(",").map((broker) =>
	broker.trim(),
);

const uniqueName = ({ prefix }: { prefix: string }): string =>
	`${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;

const waitFor = async ({
	until,
	timeoutMs,
}: {
	until: () => boolean;
	timeoutMs: number;
}): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (!until()) {
		if (Date.now() > deadline) throw new Error("Timed out waiting");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
};

test("every subscriber reads every invalidation published after it started", async () => {
	const kafka = new Kafka(
		createKafkaClient({
			clientId: uniqueName({ prefix: "catalog-invalidation-test" }),
			brokers,
			transport: { logLevel: logLevel.NOTHING },
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);
	const admin = kafka.admin();
	const topic = uniqueName({ prefix: "catalog-invalidations" });
	await admin.connect();
	await admin.createTopics({
		waitForLeaders: true,
		topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
	});

	const producer = kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
	await producer.connect();
	const publisher = createCatalogInvalidationPublisher({
		ctx: { producer, topic },
	});
	// Published before any subscriber exists: nothing to it, a fresh cache holds nothing stale.
	await publisher.publish({ orgId: "org_before", env: "live", at: 1 });

	const seen: Record<"worker" | "herald", string[]> = {
		worker: [],
		herald: [],
	};
	const subscribe = (name: "worker" | "herald") =>
		createCatalogInvalidationConsumer({
			ctx: {
				kafka,
				handler: {
					apply: ({ record }) => {
						seen[name].push(`${record.orgId}:${record.env}`);
					},
					skip: ({ cause }) => {
						throw cause;
					},
				},
			},
			config: { topic, groupIdPrefix: uniqueName({ prefix: name }) },
		});
	const worker = subscribe("worker");
	const herald = subscribe("herald");
	try {
		await Promise.all([worker.start(), herald.start()]);
		// A fresh group is assigned its partition only once the coordinator has admitted it.
		await new Promise((resolve) => setTimeout(resolve, 1_500));

		await publisher.publish({ orgId: "org_1", env: "live", at: 2 });
		await publisher.publish({ orgId: "org_1", env: "sandbox", at: 3 });

		await waitFor({
			until: () => seen.worker.length === 2 && seen.herald.length === 2,
			timeoutMs: 15_000,
		});
		expect(seen.worker).toEqual(["org_1:live", "org_1:sandbox"]);
		expect(seen.herald).toEqual(["org_1:live", "org_1:sandbox"]);
	} finally {
		await Promise.allSettled([worker.stop(), herald.stop()]);
		await producer.disconnect();
		await admin.deleteTopics({ topics: [topic] }).catch(() => {});
		await admin.disconnect();
	}
});
