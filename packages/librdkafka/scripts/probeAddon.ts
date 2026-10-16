import { getKafkaJS, getLibrdkafkaInfo } from "../src/librdkafka.js";

const startedAt = performance.now();
const brokers = (process.env.PROBE_BROKERS ?? "127.0.0.1:9092").split(",");
const topic = `addon-probe-${Date.now()}`;
const { Kafka } = getKafkaJS();
const kafka = new Kafka({ kafkaJS: { brokers, clientId: "addon-probe" } });

const admin = kafka.admin();
await admin.connect();
await admin.createTopics({
	topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
});
await admin.disconnect();

const producer = kafka.producer({ kafkaJS: { idempotent: true } });
await producer.connect();
const [sent] = await producer.send({
	topic,
	messages: [{ value: "probe" }],
});
await producer.disconnect();

if (sent?.errorCode !== 0)
	throw new Error(`send failed: ${JSON.stringify(sent)}`);
console.log(
	`librdkafka ${getLibrdkafkaInfo().version}: created ${topic}, idempotent send at offset ${sent.baseOffset ?? sent.offset} in ${Math.round(performance.now() - startedAt)}ms. ADDON PROBE OK`,
);
process.exit(0);
