import { z } from "zod";
import { getBalanceWorkerPartitionCount } from "../balanceWorkerPartitionCount.js";
import { createKafkaAuthEnv } from "../kafkaAuth.js";
import {
	booleanFlag,
	brokerList,
	loopbackHost,
	positiveInteger,
	s3KeyPrefix,
	topicName,
} from "./primitives.js";
import { validateBalanceWorkerEnv } from "./validateBalanceWorkerEnv.js";

/** Every variable a balance worker reads, by what it is for. Kafka auth and the partition count join below. */
const kafka = z.object({
	KAFKA_BROKERS: brokerList,
});

const listener = z.object({
	ECS_CONTAINER_METADATA_URI_V4: z.string().url().optional(),
	BALANCE_WORKER_HOST: loopbackHost.default("127.0.0.1"),
	BALANCE_WORKER_PORT: positiveInteger.max(65535).default(8082),
	BALANCE_WORKER_ENDPOINT: z.string().url().optional(),
	BALANCE_WORKER_MAX_REQUEST_BYTES: positiveInteger.default(1048576),
});

const log = z.object({
	BALANCE_WORKER_METERING_TOPIC: topicName.default("autumn-metering"),
	BALANCE_WORKER_OWNERSHIP_TOPIC: topicName.default(
		"autumn-metering-ownership",
	),
	BALANCE_WORKER_GROUP_ID: z
		.string()
		.trim()
		.min(1)
		.default("autumn-balance-worker"),
	BALANCE_WORKER_DEPLOYMENT: z.string().trim().min(1).default("local"),
});

const state = z.object({
	BALANCE_WORKER_SQLITE_PATH: z
		.string()
		.trim()
		.min(1)
		.default(".data/balance-worker.sqlite"),
	BALANCE_WORKER_RECEIPT_RETENTION_MS: positiveInteger.default(86400000),
	BALANCE_WORKER_CHECKPOINT_MODE: z
		.enum(["off", "restore_only", "enabled"])
		.default("off"),
	BALANCE_WORKER_CHECKPOINT_BUCKET: z.string().trim().min(1).optional(),
	BALANCE_WORKER_CHECKPOINT_REGION: z.string().trim().min(1).optional(),
	BALANCE_WORKER_CHECKPOINT_PREFIX: s3KeyPrefix.default("balance-checkpoints"),
	BALANCE_WORKER_CHECKPOINT_ENDPOINT: z
		.string()
		.url()
		.regex(/^https?:\/\//)
		.optional(),
	BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: booleanFlag,
	BALANCE_WORKER_CHECKPOINT_INTERVAL_MS: positiveInteger.default(60000),
});

const postgres = z.object({
	BALANCE_WORKER_DATABASE_URL: z.string().url(),
	BALANCE_WORKER_DATABASE_POOL_SIZE: positiveInteger.default(4),
});

const catalog = z.object({
	BALANCE_WORKER_CATALOG_TTL_MS: positiveInteger.default(300000),
	BALANCE_WORKER_CATALOG_MAX_BYTES: positiveInteger.default(268435456),
});

/** The admin bucket edge configs are polled from; the same names and defaults the server uses. */
const adminS3 = z.object({
	S3_BUCKET: z.string().trim().min(1).default("autumn-prod-server"),
	S3_REGION: z.string().trim().min(1).default("us-east-2"),
});

const balanceWorkerEnvSchema = kafka
	.merge(listener)
	.merge(log)
	.merge(state)
	.merge(postgres)
	.merge(catalog)
	.merge(adminS3)
	.superRefine(validateBalanceWorkerEnv);

export function createBalanceWorkerEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	const env = balanceWorkerEnvSchema.parse(runtimeEnv);
	const host =
		env.BALANCE_WORKER_HOST === "::1" ? "[::1]" : env.BALANCE_WORKER_HOST;
	return {
		...env,
		...createKafkaAuthEnv({ runtimeEnv }),
		BALANCE_WORKER_PARTITION_COUNT: getBalanceWorkerPartitionCount({
			runtimeEnv,
		}),
		BALANCE_WORKER_ENDPOINT: env.BALANCE_WORKER_ENDPOINT
			? new URL(env.BALANCE_WORKER_ENDPOINT).origin
			: `http://${host}:${env.BALANCE_WORKER_PORT}`,
	};
}

export type BalanceWorkerEnv = ReturnType<typeof createBalanceWorkerEnv>;

let balanceWorkerEnv: BalanceWorkerEnv | undefined;

export function getBalanceWorkerEnv(): BalanceWorkerEnv {
	balanceWorkerEnv ??= createBalanceWorkerEnv(process.env);
	return balanceWorkerEnv;
}
