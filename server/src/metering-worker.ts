import "dotenv/config";

import { logger } from "./external/logtail/logtailUtils.js";
import { KafkaMeteringLog } from "./internal/metering/log/kafkaMeteringLog.js";
import { S3SnapshotStore } from "./internal/metering/snapshot/s3SnapshotStore.js";
import { createMeteringHttpApp } from "./internal/metering/worker/meteringHttpApp.js";
import { PartitionWorker } from "./internal/metering/worker/partitionWorker.js";

const OWNED_PARTITION = 0;
const CONSUME_INTERVAL_MS = 250;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const requireEnv = ({ name }: { name: string }): string => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var ${name}`);
	return value;
};

const kafkaBootstrap = requireEnv({ name: "KAFKA_BOOTSTRAP" });
const eventsTopic = requireEnv({ name: "EVENTS_TOPIC" });
const consumerGroup = requireEnv({ name: "CONSUMER_GROUP" });
const snapshotBucket = requireEnv({ name: "SNAPSHOT_BUCKET" });
const envName = requireEnv({ name: "ENV_NAME" });
const port = Number(process.env.PORT ?? 8080);

const log = new KafkaMeteringLog({
	brokers: kafkaBootstrap
		.split(",")
		.map((broker) => broker.trim())
		.filter(Boolean),
	topic: eventsTopic,
	consumerGroup,
	partition: OWNED_PARTITION,
});

const worker = new PartitionWorker({
	partition: OWNED_PARTITION,
	log,
	snapshotStore: new S3SnapshotStore({
		bucket: snapshotBucket,
		prefix: `metering/${envName}`,
	}),
});

await worker.takeOwnership();
await log.connect({ fromOffset: worker.offset });
const startupHighWatermark = await worker.captureHighWatermark();

const server = Bun.serve({
	port,
	fetch: createMeteringHttpApp({ worker }).fetch,
});

logger.info(
	`[metering-worker] partition ${OWNED_PARTITION} owned at epoch ${worker.epoch}, offset ${worker.offset}, startup target ${startupHighWatermark}, serving on ${port}`,
);

let isShuttingDown = false;

const pumpLog = async () => {
	while (!isShuttingDown) {
		try {
			await worker.consume();
		} catch (error) {
			logger.error("[metering-worker] consume failed", { error });
		}
		await Bun.sleep(CONSUME_INTERVAL_MS);
	}
};

const shutdown = async () => {
	if (isShuttingDown) return;
	isShuttingDown = true;
	logger.info("[metering-worker] shutting down");

	const forceExit = setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS);
	forceExit.unref?.();

	await server.stop();
	await log.disconnect().catch((error) => {
		logger.warn("[metering-worker] kafka disconnect failed", { error });
	});

	clearTimeout(forceExit);
	process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await pumpLog();
