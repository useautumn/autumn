import { Kafka, logLevel } from "kafkajs";
const SPIKE_BROKERS = ["127.0.0.1:19092"];

/** Reads two topics from the start and compares every record's key, value and headers byte for byte. */
const [left, right, expectedArg] = process.argv.slice(2);
if (!left || !right) throw new Error("usage: compareTopics.ts <topicA> <topicB> [count]");
const expected = Number(expectedArg ?? 0);
const kafka = new Kafka({ clientId: "bw-spike-compare", brokers: SPIKE_BROKERS, logLevel: logLevel.ERROR });

type Rec = { offset: string; key: Buffer | null; value: Buffer | null; headers: string };

async function readAll(topic: string): Promise<Rec[]> {
	const consumer = kafka.consumer({ groupId: `bw-spike-compare-${topic}-${Date.now()}`, readUncommitted: false });
	await consumer.connect();
	await consumer.subscribe({ topic, fromBeginning: true });
	const records: Rec[] = [];
	const startedAt = Date.now();
	let lastAt = Date.now();
	await consumer.run({
		eachMessage: async ({ message }) => {
			lastAt = Date.now();
			records.push({
				offset: message.offset,
				key: message.key,
				value: message.value,
				headers: JSON.stringify(Object.entries(message.headers ?? {}).map(([k, v]) => [k, v?.toString("hex")])),
			});
		},
	});
	// Group join alone can take seconds; wait for the expected count (60 s cap), then for 3 s of quiet.
	while (
		(records.length < expected && Date.now() - startedAt < 60_000) ||
		Date.now() - lastAt < 3000
	)
		await Bun.sleep(200);
	await consumer.disconnect();
	return records;
}

const a = await readAll(left);
const b = await readAll(right);
let mismatches = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
	const x = a[i];
	const y = b[i];
	const same =
		x && y && x.headers === y.headers && Buffer.compare(x.key ?? Buffer.alloc(0), y.key ?? Buffer.alloc(0)) === 0 &&
		Buffer.compare(x.value ?? Buffer.alloc(0), y.value ?? Buffer.alloc(0)) === 0;
	if (!same && mismatches++ < 3) console.error(`record ${i} differs:\n  ${x?.value?.toString().slice(0, 300)}\n  ${y?.value?.toString().slice(0, 300)}`);
}
const valueBytes = a.reduce((sum, r) => sum + (r.value?.length ?? 0), 0);
console.log(JSON.stringify({ left, right, leftRecords: a.length, rightRecords: b.length, valueBytes, mismatches }));
process.exit(mismatches === 0 && a.length === b.length && a.length > 0 ? 0 : 1);
