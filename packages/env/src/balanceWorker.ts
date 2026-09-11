import { z } from "zod";
import { getBalanceWorkerPartitionCount } from "./balanceWorkerPartitionCount.js";
import { createKafkaAuthEnv } from "./kafkaAuth.js";

const positiveInteger = z.coerce.number().int().positive().safe();
const topicName = z
	.string()
	.trim()
	.min(1)
	.max(249)
	.regex(/^[a-zA-Z0-9._-]+$/)
	.refine(isTopicName);
const loopbackHost = z.enum(["127.0.0.1", "localhost", "::1"]);
const workerEnvironmentBaseSchema = z.object({
	ECS_CONTAINER_METADATA_URI_V4: z.string().url().optional(),
	KAFKA_BROKERS: z
		.string()
		.transform(parseBrokers)
		.pipe(
			z
				.array(
					z
						.string()
						.regex(/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):\d+$/)
						.refine(hasValidBrokerPort),
				)
				.min(1),
		),
	BALANCE_WORKER_HOST: loopbackHost.default("127.0.0.1"),
	BALANCE_WORKER_PORT: positiveInteger.max(65535).default(8082),
	BALANCE_WORKER_ENDPOINT: z.string().url().optional(),
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
	BALANCE_WORKER_SQLITE_PATH: z
		.string()
		.trim()
		.min(1)
		.default(".data/balance-worker.sqlite"),
	BALANCE_WORKER_MAX_REQUEST_BYTES: positiveInteger.default(1048576),
	BALANCE_WORKER_RECEIPT_RETENTION_MS: positiveInteger.default(86400000),
	BALANCE_WORKER_CHECKPOINT_MODE: z
		.enum(["off", "restore_only", "enabled"])
		.default("off"),
	BALANCE_WORKER_CHECKPOINT_BUCKET: z.string().trim().min(1).optional(),
	BALANCE_WORKER_CHECKPOINT_REGION: z.string().trim().min(1).optional(),
	BALANCE_WORKER_CHECKPOINT_PREFIX: z
		.string()
		.trim()
		.refine(hasCheckpointPrefix)
		.default("balance-checkpoints"),
	BALANCE_WORKER_CHECKPOINT_ENDPOINT: z
		.string()
		.url()
		.regex(/^https?:\/\//)
		.optional(),
	BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: z
		.enum(["true", "false"])
		.default("false")
		.transform(isTrue),
	BALANCE_WORKER_CHECKPOINT_INTERVAL_MS: positiveInteger.default(60000),
});

const workerEnvironmentSchema = workerEnvironmentBaseSchema.superRefine(
	validateWorkerEnvironment,
);

function validateWorkerEnvironment(
	env: z.infer<typeof workerEnvironmentBaseSchema>,
	context: z.RefinementCtx,
): void {
	if (env.BALANCE_WORKER_CHECKPOINT_MODE !== "off") {
		for (const name of [
			"BALANCE_WORKER_CHECKPOINT_BUCKET",
			"BALANCE_WORKER_CHECKPOINT_REGION",
		] as const) {
			if (!env[name])
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: [name],
					message: "is required when checkpoint mode is not off",
				});
		}
		if (env.BALANCE_WORKER_SQLITE_PATH === ":memory:")
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["BALANCE_WORKER_SQLITE_PATH"],
				message: "S3 checkpoints require a file-backed SQLite database",
			});
	}
	if (env.BALANCE_WORKER_METERING_TOPIC === env.BALANCE_WORKER_OWNERSHIP_TOPIC)
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["BALANCE_WORKER_OWNERSHIP_TOPIC"],
			message: "must differ from metering topic",
		});
	if (env.BALANCE_WORKER_ENDPOINT) {
		const url = new URL(env.BALANCE_WORKER_ENDPOINT);
		const host = url.hostname.replace(/^\[|\]$/g, "");
		if (
			url.protocol !== "http:" ||
			!loopbackHost.safeParse(host).success ||
			url.hostname !==
				(env.BALANCE_WORKER_HOST === "::1"
					? "[::1]"
					: env.BALANCE_WORKER_HOST) ||
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash ||
			Number(url.port || 80) !== env.BALANCE_WORKER_PORT
		)
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["BALANCE_WORKER_ENDPOINT"],
				message: "must be a loopback HTTP origin on the listener port",
			});
	}
}

export function createBalanceWorkerEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	const env = workerEnvironmentSchema.parse(runtimeEnv);
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

function isTopicName(value: string): boolean {
	return value !== "." && value !== "..";
}
function isTrue(value: string): boolean {
	return value === "true";
}
function hasCheckpointPrefix(value: string): boolean {
	return value.replace(/^\/+|\/+$/g, "").trim().length > 0;
}
function parseBrokers(value: string): string[] {
	const brokers: string[] = [];
	for (const broker of value.split(",")) brokers.push(broker.trim());
	return brokers;
}
function hasValidBrokerPort(broker: string): boolean {
	const port = Number(broker.slice(broker.lastIndexOf(":") + 1));
	return port > 0 && port <= 65535;
}
