import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { Kafka } from "kafkajs";
import { validateBalanceWorkerTopics } from "../src/init/workerConfig.js";

/** One partition keeps invalidations in order; an hour outlives any cache TTL, so nothing older matters. */
const CATALOG_INVALIDATION_PARTITIONS = 1;
const CATALOG_INVALIDATION_RETENTION_MS = "3600000";

async function setup(): Promise<void> {
	const env = createBalanceWorkerEnv({
		...process.env,
		KAFKA_AUTH_MODE: "none",
	});
	if (
		env.BALANCE_WORKER_DEPLOYMENT !== "local" ||
		hasRemoteBroker(env.KAFKA_BROKERS)
	)
		throw new Error(
			"Local topic setup requires loopback brokers and the local deployment",
		);
	const admin = new Kafka({
		clientId: "balance-worker-local-setup",
		brokers: env.KAFKA_BROKERS,
	}).admin();
	await admin.connect();
	try {
		const topics = [
			{
				topic: env.BALANCE_WORKER_METERING_TOPIC,
				numPartitions: env.BALANCE_WORKER_PARTITION_COUNT,
				replicationFactor: 1,
			},
			{
				topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
				numPartitions: env.BALANCE_WORKER_PARTITION_COUNT,
				replicationFactor: 1,
				configEntries: [{ name: "cleanup.policy", value: "compact" }],
			},
			{
				topic: env.BALANCE_WORKER_COMMAND_TOPIC,
				numPartitions: env.BALANCE_WORKER_PARTITION_COUNT,
				replicationFactor: 1,
			},
			{
				topic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
				numPartitions: CATALOG_INVALIDATION_PARTITIONS,
				replicationFactor: 1,
				configEntries: [
					{ name: "retention.ms", value: CATALOG_INVALIDATION_RETENTION_MS },
				],
			},
		];
		const existingTopics = new Set(await admin.listTopics());
		const missingTopics = [];
		for (const topic of topics) {
			if (!existingTopics.has(topic.topic)) missingTopics.push(topic);
		}
		if (missingTopics.length > 0)
			await admin.createTopics({ waitForLeaders: true, topics: missingTopics });
		await validateBalanceWorkerTopics({ admin, env });
		console.info(
			`Balance worker topics ready on ${env.KAFKA_BROKERS.join(", ")}: ${env.BALANCE_WORKER_METERING_TOPIC}, ${env.BALANCE_WORKER_OWNERSHIP_TOPIC}, ${env.BALANCE_WORKER_COMMAND_TOPIC} (${env.BALANCE_WORKER_PARTITION_COUNT} partitions), ${env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC}`,
		);
	} finally {
		await admin.disconnect();
	}
}
function hasRemoteBroker(brokers: string[]): boolean {
	for (const broker of brokers) {
		if (!/^(127\.0\.0\.1|localhost|\[::1\]):/.test(broker)) return true;
	}
	return false;
}
async function main(): Promise<void> {
	try {
		await setup();
	} catch (cause) {
		console.error("Balance worker local topic setup failed", cause);
		process.exitCode = 1;
	}
}
void main();
