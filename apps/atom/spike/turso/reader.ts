import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { connect } from "@tursodatabase/sync";
import { dbToken, dbUrl, nowMs } from "./config";
import { customerIdOf, READ_SUBJECT_SQL } from "./schema";

/** One Atom: keeps a local replica in sync and records when each write first becomes visible. */
type ReaderParams = {
	db: string;
	engine: "er" | "ts";
	file: string;
	out: string;
	seconds: number;
	pollMs: number;
	keys: number;
	pointReads: number;
};

type Replica = {
	sync: () => Promise<void>;
	receivedBytes: () => Promise<number | null>;
	all: (sql: string, args: unknown[]) => Promise<Record<string, unknown>[]>;
	close: () => void;
};

const params: ReaderParams = JSON.parse(process.argv[2] ?? "{}");

let framesSynced = 0;

const openEmbeddedReplica = (): Replica => {
	const client = createClient({
		url: `file:${params.file}`,
		syncUrl: dbUrl({ db: params.db }),
		authToken: dbToken({ db: params.db, access: "read" }),
	});
	return {
		sync: async () => {
			const result = await client.sync();
			framesSynced += result?.frames_synced ?? 0;
		},
		receivedBytes: async () => framesSynced * 4096,
		all: async (sql, args) =>
			(await client.execute({ sql, args: args as never })).rows as never,
		close: () => client.close(),
	};
};

const openTursoSync = async (): Promise<Replica> => {
	const db = await connect({
		path: params.file,
		url: dbUrl({ db: params.db }).replace("libsql://", "https://"),
		authToken: dbToken({ db: params.db, access: "read" }),
		longPollTimeoutMs: params.pollMs,
	});
	const statements = new Map<string, Awaited<ReturnType<typeof db.prepare>>>();
	return {
		sync: async () => {
			await db.pull();
		},
		receivedBytes: async () => Number((await db.stats()).networkReceivedBytes),
		all: async (sql, args) => {
			const statement = statements.get(sql) ?? (await db.prepare(sql));
			statements.set(sql, statement);
			return statement.all(...(args as never[]));
		},
		close: () => void db.close(),
	};
};

const openedAtMs = nowMs();
const replica =
	params.engine === "er" ? openEmbeddedReplica() : await openTursoSync();

const seen: number[][] = [];
const lastSeqByKey = new Map<string, number>();
const syncMs: number[] = [];
const errors: string[] = [];
let outOfOrder = 0;
let maxSeq = 0;
let firstSyncDoneMs: number | null = null;

const flush = (extra: Record<string, unknown> = {}) =>
	writeFileSync(
		params.out,
		JSON.stringify({
			params,
			openedAtMs,
			firstSyncDoneMs,
			seen,
			syncMs,
			errors,
			outOfOrder,
			...extra,
		}),
	);

const recordNewRows = async () => {
	const rows = await replica.all(
		"SELECT customer_id, seq FROM subject_states WHERE seq > ? ORDER BY seq",
		[maxSeq],
	);
	const atMs = nowMs();
	for (const row of rows) {
		const key = String(row.customer_id);
		const seq = Number(row.seq);
		const prev = lastSeqByKey.get(key) ?? 0;
		if (seq < prev) outOfOrder += 1;
		lastSeqByKey.set(key, seq);
		seen.push([seq, atMs]);
		if (seq > maxSeq) maxSeq = seq;
	}
};

const deadline = openedAtMs + params.seconds * 1000;
let lastFlush = nowMs();
while (nowMs() < deadline) {
	const t = nowMs();
	try {
		await replica.sync();
		syncMs.push(nowMs() - t);
		firstSyncDoneMs ??= nowMs();
		await recordNewRows();
	} catch (error) {
		errors.push(`${Math.round(nowMs())} ${String(error).slice(0, 160)}`);
		await Bun.sleep(200);
	}
	if (params.engine === "er" && params.pollMs > 0)
		await Bun.sleep(params.pollMs);
	if (nowMs() - lastFlush > 1000) {
		flush();
		lastFlush = nowMs();
	}
}

await replica
	.sync()
	.catch((e) => errors.push(`final ${String(e).slice(0, 160)}`));
await recordNewRows();
const finalState = (
	await replica.all("SELECT customer_id, seq FROM subject_states", [])
).map((r) => [String(r.customer_id), Number(r.seq)]);

const readUs: number[] = [];
for (let i = 0; i < params.pointReads; i++) {
	const key = customerIdOf(Math.floor(Math.random() * params.keys));
	const t = performance.now();
	const rows = await replica.all(READ_SUBJECT_SQL, [key]);
	if (rows[0]) JSON.parse(String(rows[0].state_json));
	readUs.push((performance.now() - t) * 1000);
}

flush({
	finalState,
	readUs,
	receivedBytes: await replica.receivedBytes(),
	done: true,
});
replica.close();
