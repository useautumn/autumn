/**
 * Provokes a real librdkafka fatal error on a KIP-848 consumer that is busy reading, and reports whether a
 * batch consume ever hands it to the application. A DENY on the group's READ makes the next
 * ConsumerGroupHeartbeat answer GROUP_AUTHORIZATION_FAILED, which librdkafka 2.15 raises as a fatal error
 * (rdkafka_cgrp.c, rd_kafka_cgrp_handle_ConsumerGroupHeartbeat): it queues one ERR__FATAL and revokes the
 * assignment as lost. A consumer polling back to back over a deep backlog is almost always inside a batch
 * consume when that happens, so the ERR__FATAL arrives after the batch already holds records.
 *
 * Without patches/consumeErrorAfterRecords.patch, KafkaConsumerConsumeNum returns the records and drops the
 * error; librdkafka raises it once, so the consumer stays up owning nothing and never hears why. With it, the
 * next consume returns ERR__FATAL (with fatalErrorCause.patch: its cause, GROUP_AUTHORIZATION_FAILED, isFatal).
 *
 *   PROBE_BROKERS=127.0.0.1:29095 PROBE_USER=app PROBE_PASSWORD=... PROBE_ADMIN_USER=admin \
 *   PROBE_ADMIN_PASSWORD=... PROBE_ACLS=<path to kafka-acls.sh> PROBE_ADMIN_CONFIG=<admin client properties> \
 *   PROBE_ACL_BOOTSTRAP=<listener matching that config, default PROBE_BROKERS> \
 *   bun packages/librdkafka/tests/chaos/fatalAfterRecords.ts
 *
 * Prints one JSON line: whether ERR__FATAL reached a consume, and whether the batch before it held records.
 */
import {
	getKafkaJS,
	getNativeKafkaConsumer,
	LIBRDKAFKA_ERROR_CODES,
} from "../../src/librdkafka.js";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}
const brokers = required("PROBE_BROKERS");
const acls = required("PROBE_ACLS");
const adminConfig = required("PROBE_ADMIN_CONFIG");
const RECORDS = Number(process.env.PROBE_RECORDS ?? 1_500_000);
const BATCH = Number(process.env.PROBE_BATCH ?? 10_000);
const WATCH_MS = Number(process.env.PROBE_WATCH_MS ?? 30_000);
const id = crypto.randomUUID().slice(0, 8);
const topic = `fatal-probe-${id}`;
const groupId = `fatal-probe-${id}`;
const sasl = (user: string, password: string) => ({
	"bootstrap.servers": brokers,
	"security.protocol": "SASL_SSL",
	"sasl.mechanisms": "SCRAM-SHA-512",
	"sasl.username": user,
	"sasl.password": password,
});

const { Kafka } = getKafkaJS();
const kafka = new Kafka(
	sasl(
		required("PROBE_ADMIN_USER"),
		required("PROBE_ADMIN_PASSWORD"),
	) as ConstructorParameters<typeof Kafka>[0],
);
const admin = kafka.admin();
await admin.connect();
await admin.createTopics({
	topics: [{ topic, numPartitions: 1, replicationFactor: 3 }],
});
const producer = kafka.producer({ "linger.ms": 5 });
await producer.connect();
const value = Buffer.alloc(100, 1);
for (let sent = 0; sent < RECORDS; sent += 1_000)
	await producer.send({
		topic,
		messages: Array.from({ length: 1_000 }, (_, i) => ({
			key: String(sent + i),
			value,
		})),
	});
await producer.disconnect();

async function denyGroupRead(action: "add" | "remove"): Promise<void> {
	const shell = Bun.spawn(
		[
			acls,
			"--bootstrap-server",
			process.env.PROBE_ACL_BOOTSTRAP ?? brokers,
			"--command-config",
			adminConfig,
			`--${action}`,
			...(action === "remove" ? ["--force"] : []),
			"--deny-principal",
			`User:${required("PROBE_USER")}`,
			"--operation",
			"Read",
			"--group",
			groupId,
		],
		{ stdout: "ignore", stderr: "inherit" },
	);
	if ((await shell.exited) !== 0)
		throw new Error(`kafka-acls --${action} failed`);
}

type ConsumeError = { code: number; message: string; isFatal?: boolean };
type Native = {
	connect(opts: object, cb: (error: unknown) => void): void;
	subscribe(topics: string[]): void;
	consume(
		n: number,
		cb: (error: ConsumeError | null, messages: unknown[]) => void,
	): void;
	incrementalAssign(partitions: object[]): void;
	incrementalUnassign(partitions: object[]): void;
	on(event: string, listener: (...args: never[]) => void): void;
	disconnect(cb: () => void): void;
};
const NativeConsumer = getNativeKafkaConsumer() as unknown as new (
	global: object,
	topic: object,
) => Native;
let native: Native | null = null;
const events: { t: number; kind: string; detail: unknown }[] = [];
const t0 = performance.now();
const at = () => Math.round(performance.now() - t0);
native = new NativeConsumer(
	{
		...sasl(required("PROBE_USER"), required("PROBE_PASSWORD")),
		"group.id": groupId,
		"group.protocol": "consumer",
		"enable.auto.commit": false,
		event_cb: true,
		rebalance_cb(error: { code: number }, partitions: object[]) {
			events.push({
				t: at(),
				kind: "rebalance",
				detail: { code: error.code, partitions: partitions.length },
			});
			if (error.code === LIBRDKAFKA_ERROR_CODES.ERR__ASSIGN_PARTITIONS)
				native?.incrementalAssign(partitions);
			else native?.incrementalUnassign(partitions);
		},
	},
	{ "auto.offset.reset": "earliest" },
);
native.on(
	"event.error",
	(error: { code: number; message: string; isFatal?: boolean }) =>
		events.push({
			t: at(),
			kind: "event.error",
			detail: {
				code: error.code,
				isFatal: error.isFatal,
				message: error.message,
			},
		}),
);
await new Promise<void>((resolve, reject) =>
	native?.connect({}, (error) => (error ? reject(error) : resolve())),
);
native.subscribe([topic]);

function consume(): Promise<{
	error: ConsumeError | null;
	records: number;
	ms: number;
}> {
	const started = performance.now();
	return new Promise((resolve) =>
		native?.consume(BATCH, (error, messages) =>
			resolve({
				error,
				records: messages?.length ?? 0,
				ms: Math.round(performance.now() - started),
			}),
		),
	);
}

let total = 0;
let denied = false;
let deniedAt = 0;
let lastRecordAt = 0;
let previousRecords = 0;
let fatal: {
	t: number;
	previousBatchRecords: number;
	ms: number;
	code: number;
	message: string;
	isFatal?: boolean;
} | null = null;
const consumeErrors: Record<string, number> = {};
while (true) {
	const { error, records, ms } = await consume();
	total += records;
	if (records > 0) lastRecordAt = at();
	if (error && error.code !== LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT) {
		consumeErrors[error.code] = (consumeErrors[error.code] ?? 0) + 1;
		// Before fatalErrorCause.patch a fatal error arrives as a bare ERR__FATAL; after it, as its cause with isFatal.
		if (
			(error.code === LIBRDKAFKA_ERROR_CODES.ERR__FATAL || error.isFatal) &&
			!fatal
		)
			fatal = {
				t: at(),
				previousBatchRecords: previousRecords,
				ms,
				code: error.code,
				message: error.message,
				isFatal: error.isFatal,
			};
	}
	previousRecords = records;
	// Started once records flow. The consumer polls back to back, so it is almost always inside a batch
	// consume, waiting out the 1 ms that follows each record: where an error that arrives lands after records.
	if (!denied && total >= BATCH * 4) {
		denied = true;
		deniedAt = at();
		void denyGroupRead("add");
	}
	if (fatal || (denied && at() - deniedAt > WATCH_MS)) break;
	await Bun.sleep(Number(process.env.PROBE_SLEEP_MS ?? 0));
}
await denyGroupRead("remove");
const result = {
	librdkafkaPatched: process.env.PROBE_LABEL ?? "unknown",
	deniedAtMs: deniedAt,
	fatalReachedConsume: fatal !== null,
	fatal,
	lastRecordAtMs: lastRecordAt,
	recordsRead: total,
	recordsProduced: RECORDS,
	consumeErrors,
	events,
};
console.log(JSON.stringify(result));
await new Promise<void>((resolve) => native?.disconnect(resolve));
await admin.deleteTopics({ topics: [topic] });
await admin.disconnect();
process.exit(0);
