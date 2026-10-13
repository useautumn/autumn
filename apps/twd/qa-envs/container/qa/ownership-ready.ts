// Exits once every local-ownership partition holds its preparing → ready → claimed records.
const { createKafka, createKafkaClient } = await import(
	Bun.resolveSync("@autumn/kafka", "/app/apps/balance-worker/")
);

const partitions = 4;
const admin = createKafka(
	createKafkaClient({
		clientId: "qa-ownership-ready",
		brokers: ["127.0.0.1:19092"],
		transport: {},
		limits: {
			connectionTimeoutMs: 3_000,
			requestTimeoutMs: 5_000,
			retryCount: 1,
			initialRetryTimeMs: 100,
			maxRetryTimeMs: 500,
		},
		logSink: { error() {}, warn() {}, info() {}, debug() {} },
	}),
).admin();
await admin.connect();

while (true) {
	const offsets: { high: string }[] = await admin
		.fetchTopicOffsets("local-ownership")
		.catch(() => []);
	if (offsets.filter(({ high }) => Number(high) >= 3).length >= partitions)
		break;
	await Bun.sleep(200);
}
await admin.disconnect();
