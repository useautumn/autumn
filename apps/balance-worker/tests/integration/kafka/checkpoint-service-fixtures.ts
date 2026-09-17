import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createOwnershipConsumer,
	serializeMeteringRecord,
} from "@autumn/kafka";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";
import type { BalanceWorker } from "../../../src/init/types/balanceWorker.js";
import { createS3CheckpointObjectClient } from "../../../src/s3/s3CheckpointObjectClient.js";
import {
	createS3PartitionCheckpointStorage,
	partitionCheckpointObjectKeyOf,
} from "../../../src/s3/s3PartitionCheckpointStorage.js";

export const waitForCheckpointService = async ({
	ready,
}: {
	ready(): Promise<boolean>;
}): Promise<void> => {
	const deadline = Date.now() + 10_000;
	while (!(await ready())) {
		if (Date.now() >= deadline)
			throw new Error("Checkpoint service did not reach its expected state");
		await Bun.sleep(20);
	}
};

export const createCheckpointServiceFixture = async () => {
	const id = crypto.randomUUID();
	const topic = `checkpoint-service-${id}`;
	const ownershipTopic = `${topic}-owners`;
	const bucket = `checkpoint-service-${id}`;
	const directory = mkdtempSync(join(tmpdir(), "balance-checkpoint-service-"));
	const endpoint = process.env.S3_TEST_ENDPOINT ?? "http://127.0.0.1:19000";
	const brokers = process.env.KAFKA_BROKERS;
	if (!brokers) throw new Error("Local Kafka test brokers are required");
	const kafka = new Kafka({
		clientId: id,
		brokers: brokers.split(","),
		logLevel: logLevel.NOTHING,
	});
	const admin = kafka.admin();
	const s3 = new S3Client({
		region: "us-east-1",
		endpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: "autumn-test",
			secretAccessKey: "autumn-test-secret",
		},
		maxAttempts: 1,
	});
	const storage = createS3PartitionCheckpointStorage({
		client: createS3CheckpointObjectClient({ client: s3 }),
		bucket,
		keyPrefix: "balance-checkpoints",
		deploymentEnvironment: id,
		limits: {
			maxSerializedBytes: 64 * 1024 * 1024,
			maxCompressedBytes: 16 * 1024 * 1024,
			maxPublishAttempts: 3,
		},
	});
	const services: BalanceWorker[] = [];
	const routing = createOwnershipConsumer({
		ctx: { kafka },
		config: { topic: ownershipTopic },
	});
	const errors: unknown[] = [];
	const state = createCustomerMeteringState({
		identity: { orgId: "org", env: "sandbox", customerId: "customer" },
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages", balance: 10, usage: 0 }],
			},
		},
	});
	const producer = kafka.producer();
	const close = async (): Promise<void> => {
		for (const service of services) await service.stop();
		await routing.stop();
		await producer.disconnect();
		await admin.deleteTopics({ topics: [topic, ownershipTopic] });
		await admin.disconnect();
		await s3.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: partitionCheckpointObjectKeyOf({
					keyPrefix: "balance-checkpoints",
					deploymentEnvironment: id,
					topic,
					partition: 0,
				}),
			}),
		);
		await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
		s3.destroy();
		rmSync(directory, { recursive: true, force: true });
	};
	try {
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{ topic, numPartitions: 1, replicationFactor: 1 },
				{
					topic: ownershipTopic,
					numPartitions: 1,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});
		await s3.send(new CreateBucketCommand({ Bucket: bucket }));
		await producer.connect();
		await producer.send({
			topic,
			messages: [
				{
					partition: 0,
					...serializeMeteringRecord({
						record: {
							schemaVersion: 1,
							type: "state_initialized",
							initializationId: id,
							initializedAt: Date.now(),
							state,
						},
					}),
				},
			],
		});
		await producer.disconnect();
		await routing.start();
	} catch (cause) {
		await close();
		throw cause;
	}
	const client = createBalanceWorkerClient({
		ctx: { owners: routing },
		config: { partitionCount: 1, timeoutMs: 5000 },
	});
	const command = ({
		commandId,
		value,
	}: {
		commandId: string;
		value: number;
	}) =>
		parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId: commandId,
				identity: state.identity,
				entityId: null,
				featureId: "messages",
				value,
				overageBehavior: "reject",
				properties: null,
				occurredAt: Date.now(),
			},
		});
	const start = async ({
		mode,
		file = "state.sqlite",
		checkpointEndpoint = endpoint,
		intervalMs = 60_000,
	}: {
		mode: "off" | "restore_only" | "enabled";
		file?: string;
		checkpointEndpoint?: string;
		intervalMs?: number;
	}) => {
		const reservation = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () => new Response(),
		});
		const port = reservation.port;
		await reservation.stop();
		const databasePath = join(directory, file);
		const env = createBalanceWorkerEnv({
			KAFKA_BROKERS: brokers,
			BALANCE_WORKER_PORT: String(port),
			BALANCE_WORKER_SQLITE_PATH: databasePath,
			BALANCE_WORKER_METERING_TOPIC: topic,
			BALANCE_WORKER_OWNERSHIP_TOPIC: ownershipTopic,
			BALANCE_WORKER_PARTITION_COUNT: "1",
			BALANCE_WORKER_GROUP_ID: id,
			BALANCE_WORKER_DEPLOYMENT: id,
			BALANCE_WORKER_CHECKPOINT_MODE: mode,
			BALANCE_WORKER_CHECKPOINT_BUCKET: bucket,
			BALANCE_WORKER_CHECKPOINT_REGION: "us-east-1",
			BALANCE_WORKER_CHECKPOINT_ENDPOINT: checkpointEndpoint,
			BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: "true",
			BALANCE_WORKER_CHECKPOINT_INTERVAL_MS: String(intervalMs),
		});
		const service = await createBalanceWorker({
			ctx: {
				onError: ({ cause }) => {
					errors.push(cause);
				},
				logger: { info: () => {}, warn: () => {}, error: () => {} },
			},
			config: { env },
		});
		services.push(service);
		await service.start();
		await waitForCheckpointService({
			ready: async () => {
				await routing.refresh();
				return (
					routing.findOwner({ partition: 0 })?.endpoint ===
					env.BALANCE_WORKER_ENDPOINT
				);
			},
		});
		return { service, databasePath };
	};
	return {
		topic,
		admin,
		errors,
		start,
		client,
		command,
		close,
		latest: () =>
			storage.latest({
				topic,
				partition: 0,
				signal: new AbortController().signal,
			}),
	};
};
