import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { dbToken, dbUrl, nowMs } from "./config";
import {
	customerIdOf,
	SUBJECT_STATES_DDL,
	subjectRow,
	upsertSubjectsSql,
} from "./schema";

/** Writes subject upserts to the primary, as Autumn/herald would, and records each ack. */
type WriterParams = {
	db: string;
	out: string;
	seconds: number;
	ratePerSec: number;
	rowsPerRequest: number;
	maxInFlight: number;
	keys: number;
	bytes: number;
	startSeq: number;
};

const params: WriterParams = JSON.parse(process.argv[2] ?? "{}");
const client = createClient({
	url: dbUrl({ db: params.db }).replace("libsql://", "https://"),
	authToken: dbToken({ db: params.db, access: "full" }),
});

await client.batch(SUBJECT_STATES_DDL, "write");

const acks: number[][] = [];
const errors: string[] = [];
let seq = params.startSeq;
let inFlight = 0;

const sendRequest = async () => {
	const rows = Array.from({ length: params.rowsPerRequest }, () => {
		seq += 1;
		const key = Math.floor(Math.random() * params.keys);
		return { seq, key };
	});
	// A key repeated within one statement would hit ON CONFLICT twice; keep its last row only.
	const lastByKey = new Map(rows.map((r) => [r.key, r]));
	const statement = {
		sql: upsertSubjectsSql({ rows: lastByKey.size }),
		args: [...lastByKey.values()].flatMap(({ seq, key }) =>
			subjectRow({ customerId: customerIdOf(key), seq, bytes: params.bytes }),
		) as never,
	};
	const sentMs = nowMs();
	inFlight += 1;
	try {
		await client.execute(statement);
		const ackMs = nowMs();
		for (const r of rows) acks.push([r.seq, r.key, sentMs, ackMs]);
	} catch (error) {
		errors.push(String(error).slice(0, 200));
	} finally {
		inFlight -= 1;
	}
};

const requestsPerSec = params.ratePerSec / params.rowsPerRequest;
const startMs = nowMs();
const pending: Promise<void>[] = [];
let sent = 0;
while (nowMs() - startMs < params.seconds * 1000) {
	const due = Math.floor(((nowMs() - startMs) / 1000) * requestsPerSec);
	while (sent < due && inFlight < params.maxInFlight) {
		pending.push(sendRequest());
		sent += 1;
	}
	await Bun.sleep(5);
}
await Promise.all(pending);

writeFileSync(
	params.out,
	JSON.stringify({
		params,
		acks,
		errors,
		startMs,
		endMs: nowMs(),
		lastSeq: seq,
	}),
);
client.close();
