import "dotenv/config";

import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
import { Kafka, logLevel } from "kafkajs";
import type { MeteringEvent } from "./internal/metering/events/meteringEventSchema.js";
import { computeLatencyStats } from "./internal/metering/loadtest/percentiles.js";
import { printSummary } from "./internal/metering/loadtest/summary.js";
import { startFixedTickLoop } from "./internal/metering/loadtest/tickScheduler.js";
import { partitionForEvent } from "./internal/metering/log/kafkaMeteringLog.js";

// One-off ECS Fargate task: produces synthetic `deduct` events onto the
// metering events topic to load-test the Kafka -> partition-worker path.
// All synthetic identifiers carry an `lt_` prefix so this data is easy to
// spot and purge in staging.
const TICK_INTERVAL_MS = 50;
const LOADTEST_ORG_ID = "org_loadtest";
const LOADTEST_ENV = "sandbox";
// The deployed metering-worker only ever owns partition 0 today (see
// metering-worker.ts), so the producer targets a single partition to keep
// generated load meaningful against the currently running worker.
const PARTITION_COUNT = 1;

const requireEnv = ({ name }: { name: string }): string => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var ${name}`);
	return value;
};

const kafkaBootstrap = requireEnv({ name: "KAFKA_BOOTSTRAP" });
const eventsTopic = requireEnv({ name: "EVENTS_TOPIC" });
const envName = requireEnv({ name: "ENV_NAME" });

const rate = Number(process.env.LT_RATE ?? 500);
const durationS = Number(process.env.LT_DURATION_S ?? 180);
const customerCount = Number(process.env.LT_CUSTOMERS ?? 15000);
const featureCount = Number(process.env.LT_FEATURES ?? 3);

const kafka = new Kafka({
	clientId: `autumn-metering-loadtest-produce-${envName}`,
	brokers: kafkaBootstrap
		.split(",")
		.map((broker) => broker.trim())
		.filter(Boolean),
	ssl: true,
	logLevel: logLevel.WARN,
	sasl: {
		mechanism: "oauthbearer",
		oauthBearerProvider: async () => {
			const { token } = await generateAuthToken({
				region: process.env.AWS_REGION ?? "us-east-1",
			});
			return { value: token };
		},
	},
});

const producer = kafka.producer();
await producer.connect();

const runId = Date.now();
let eventCounter = 0;
let sent = 0;
let errors = 0;
const ackLatencyMsSamples: number[] = [];

const buildEvent = (): MeteringEvent => {
	eventCounter++;
	return {
		v: 1,
		id: `lt_evt_${runId}_${eventCounter}`,
		type: "deduct",
		org_id: LOADTEST_ORG_ID,
		env: LOADTEST_ENV,
		customer_id: `lt_cus_${Math.floor(Math.random() * customerCount)}`,
		feature_id: `lt_feature_${Math.floor(Math.random() * featureCount)}`,
		value: 1,
		event_ts: Date.now(),
	};
};

const sendBatch = async ({
	batchSize,
}: {
	batchSize: number;
}): Promise<void> => {
	const events = Array.from({ length: batchSize }, buildEvent);
	const startedAt = performance.now();
	try {
		await producer.send({
			topic: eventsTopic,
			messages: events.map((event) => ({
				key: `${event.org_id}:${event.customer_id}`,
				partition: partitionForEvent({
					event,
					partitionCount: PARTITION_COUNT,
				}),
				value: JSON.stringify(event),
			})),
		});
		ackLatencyMsSamples.push(performance.now() - startedAt);
		sent += events.length;
	} catch {
		errors += events.length;
	}
};

const startedAt = Date.now();
const controller = startFixedTickLoop({
	ratePerSec: rate,
	tickIntervalMs: TICK_INTERVAL_MS,
	durationS,
	onTick: sendBatch,
});

let summarized = false;
const summarizeAndExit = async (): Promise<void> => {
	if (summarized) return;
	summarized = true;

	const elapsedS = (Date.now() - startedAt) / 1000;
	await producer.disconnect().catch(() => {});

	printSummary({
		summary: {
			sent,
			achievedRate: elapsedS > 0 ? sent / elapsedS : 0,
			ackLatencyMs: computeLatencyStats({ samplesMs: ackLatencyMsSamples }),
			errors,
		},
	});

	process.exit(0);
};

process.on("SIGTERM", () => {
	controller.stop();
});
process.on("SIGINT", () => {
	controller.stop();
});

await controller.done;
await summarizeAndExit();
