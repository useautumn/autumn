// Exits once every local-ownership partition holds its preparing → ready → claimed records.
const { Kafka, logLevel } = await import(
	Bun.resolveSync("kafkajs", "/app/apps/balance-worker/")
);

const partitions = 4;
const admin = new Kafka({
	clientId: "qa-ownership-ready",
	brokers: ["127.0.0.1:19092"],
	logLevel: logLevel.NOTHING,
}).admin();
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
