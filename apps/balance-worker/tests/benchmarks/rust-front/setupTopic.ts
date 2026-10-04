import { Kafka, logLevel } from "kafkajs";
import { SPIKE_BROKERS, SPIKE_TOPIC } from "./createSpikeWorker.js";

/** One-partition metering topic on the local broker for the spike's real produce. */
const kafka = new Kafka({ clientId: "bw-spike-admin", brokers: SPIKE_BROKERS, logLevel: logLevel.ERROR });
const admin = kafka.admin();
await admin.connect();
const topic = process.argv[2] ?? SPIKE_TOPIC;
if (!(await admin.listTopics()).includes(topic))
	await admin.createTopics({
		// The equality run pins the clock to 2023, so its records must not age out under default retention.
		topics: [{ topic, numPartitions: 1, configEntries: [{ name: "retention.ms", value: "-1" }] }],
		waitForLeaders: true,
	});
await admin.disconnect();
console.error(`topic ${topic} ready`);
process.exit(0);
