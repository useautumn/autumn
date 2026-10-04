import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import {
	compressionFor,
	type MeteringRecord,
	serializeMeteringRecord,
} from "@autumn/kafka";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
} from "../../fixtures/mutations.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { scenarios } from "../track-throughput/scenarios.js";

/** CPU per record to encode a produce request carrying real track records, by batch size and compression. */
const require = createRequire(import.meta.url);
const kafkajs = require.resolve("kafkajs");
const produceRequest = require(
	kafkajs.replace(/index\.js$/, "src/protocol/requests/produce/v3/request.js"),
);
const { Types } = require(
	kafkajs.replace(/index\.js$/, "src/protocol/message/compression/index.js"),
);
const Long = require(kafkajs.replace(/index\.js$/, "src/utils/long.js"));

const scenario = scenarios.typical;
if (!scenario) throw new Error("typical scenario");
const records: MeteringRecord[] = [];
const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: { appendMs: 0, applyMs: 0 },
	serialize: true,
	onAppended: (outcomes) => records.push(...outcomes),
});
const identity = { ...testIdentity, customerId: "cus_0" };
await bench.processor.initialize({
	request: createInitializeRequest({
		state: scenario.stateFor({ identity }),
		commandId: "init_0",
		requestId: "req_init_0",
	}),
});
for (let n = 0; n < 400; n++)
	await bench.processor.track({
		command: createTrackCommand({
			identity,
			commandId: `trk_${n}`,
			featureId: scenario.features[n % scenario.features.length] ?? "",
			value: 1,
			occurredAt: 1_700_000_000_000 + n,
		}),
	});
const messages = records
	.filter((record) => record.type === "mutation")
	.map((record) => ({ ...serializeMeteringRecord({ record }), partition: 0 }));

const encode = async ({
	batch,
	compression,
}: {
	batch: typeof messages;
	compression: number;
}) => {
	const request = produceRequest({
		acks: -1,
		timeout: 30_000,
		transactionalId: "bench",
		producerId: Long.fromInt(1),
		producerEpoch: 0,
		compression,
		topicData: [
			{
				topic: "metering",
				partitions: [{ partition: 0, firstSequence: 0, messages: batch }],
			},
		],
	});
	return (await request.encode()).buffer.length as number;
};

const results = [];
for (const size of [1, 4, 20])
	for (const [name, compression] of [
		["gzip", Types.GZIP],
		["none", Types.None],
		["chosen", compressionFor({ records: size })],
	] as const) {
		const rounds = Math.ceil(6_000 / size);
		const batchAt = (round: number) =>
			Array.from(
				{ length: size },
				(_, i) => messages[(round * size + i) % messages.length],
			).filter((message) => message !== undefined);
		for (let round = 0; round < 200; round++)
			await encode({ batch: batchAt(round), compression });
		let bytes = 0;
		const cpuBefore = process.cpuUsage();
		const started = performance.now();
		for (let round = 0; round < rounds; round++)
			bytes += await encode({ batch: batchAt(round), compression });
		const cpu = process.cpuUsage(cpuBefore);
		const records = rounds * size;
		results.push({
			batch: size,
			compression: name,
			cpuUsPerRecord: Math.round(((cpu.user + cpu.system) / records) * 10) / 10,
			wallUsPerRecord:
				Math.round(((performance.now() - started) * 1000 * 10) / records) / 10,
			bytesPerRecord: Math.round(bytes / records),
		});
	}
console.table(results);
await bench.processor.drain();
process.exit(0);
