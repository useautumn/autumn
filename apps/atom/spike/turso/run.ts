import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { $ } from "bun";
import { dbToken, dbUrl } from "./config";
import { SUBJECT_STATES_DDL } from "./schema";

/** Runs one probe: a writer plus N replica readers, with optional restart/blip faults, then analyses it. */
type Fault = {
	type: "restart" | "blip";
	reader: number;
	atS: number;
	downS: number;
};
type Scenario = {
	name: string;
	db: string;
	engine: "er" | "ts";
	readers: number;
	seconds: number;
	pollMs: number;
	warmupS: number;
	writer: {
		ratePerSec: number;
		rowsPerRequest: number;
		maxInFlight: number;
		keys: number;
		bytes: number;
		seconds: number;
	};
	faults?: Fault[];
	pointReads?: number;
};

const BLIP_USER = "spikeblip";
const BLIP_HARNESS = "/tmp/turso-harness-blip";
const here = import.meta.dir;
const scenario: Scenario = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const runDir = join(
	process.env.SPIKE_OUT ?? `${process.env.HOME}/.capy/work/turso/runs`,
	`${scenario.name}-${Date.now()}`,
);
mkdirSync(runDir, { recursive: true });
const replicaDir = `/tmp/turso-replicas/${scenario.name}-${Date.now()}`;
mkdirSync(replicaDir, { recursive: true, mode: 0o777 });
await $`chmod 777 ${replicaDir}`;

const isBlipReader = (i: number) =>
	scenario.faults?.some((f) => f.type === "blip" && f.reader === i) ?? false;

if (scenario.faults?.some((f) => f.type === "blip")) {
	rmSync(BLIP_HARNESS, { recursive: true, force: true });
	cpSync(here, BLIP_HARNESS, { recursive: true });
	await $`chmod -R a+rX ${BLIP_HARNESS}`;
}

const readerParams = (i: number, incarnation: number) => ({
	db: scenario.db,
	engine: scenario.engine,
	file: join(replicaDir, `replica-${i}.db`),
	out: join(
		isBlipReader(i) ? replicaDir : runDir,
		`reader-${i}-${incarnation}.json`,
	),
	seconds: scenario.seconds,
	pollMs: scenario.pollMs,
	keys: scenario.writer.keys,
	pointReads: scenario.pointReads ?? 5000,
});

const spawnReader = (i: number, incarnation: number, secondsLeft: number) => {
	const p = { ...readerParams(i, incarnation), seconds: secondsLeft };
	if (!isBlipReader(i))
		return Bun.spawn(["bun", join(here, "reader.ts"), JSON.stringify(p)], {
			stdout: "inherit",
			stderr: "inherit",
		});
	return Bun.spawn(
		[
			"sudo",
			"-u",
			BLIP_USER,
			`--preserve-env=TURSO_READ_TOKEN`,
			"bun",
			join(BLIP_HARNESS, "reader.ts"),
			JSON.stringify(p),
		],
		{
			env: {
				...process.env,
				TURSO_READ_TOKEN: dbToken({ db: scenario.db, access: "read" }),
			},
			stdout: "inherit",
			stderr: "inherit",
		},
	);
};

const admin = createClient({
	url: dbUrl({ db: scenario.db }).replace("libsql://", "https://"),
	authToken: dbToken({ db: scenario.db, access: "full" }),
});
await admin.batch(SUBJECT_STATES_DDL, "write");
admin.close();

const startedAt = Date.now();
const procs = new Map<number, ReturnType<typeof spawnReader>>();
for (let i = 0; i < scenario.readers; i++)
	procs.set(i, spawnReader(i, 0, scenario.seconds));
const incarnations = new Map<number, number>();

await Bun.sleep(scenario.warmupS * 1000);
const writer = Bun.spawn(
	[
		"bun",
		join(here, "writer.ts"),
		JSON.stringify({
			...scenario.writer,
			db: scenario.db,
			out: join(runDir, "writer.json"),
			startSeq: Date.now() * 1000,
		}),
	],
	{ stdout: "inherit", stderr: "inherit" },
);

const faultLog: unknown[] = [];
const runFault = async (f: Fault) => {
	await Bun.sleep(f.atS * 1000);
	if (f.type === "restart") {
		procs.get(f.reader)!.kill(9);
		faultLog.push({ ...f, killedAt: Date.now() });
		await Bun.sleep(f.downS * 1000);
		const n = (incarnations.get(f.reader) ?? 0) + 1;
		incarnations.set(f.reader, n);
		const left = scenario.seconds - (Date.now() - startedAt) / 1000;
		procs.set(f.reader, spawnReader(f.reader, n, left));
		faultLog.push({ ...f, restartedAt: Date.now() });
		return;
	}
	const uid = (await $`id -u ${BLIP_USER}`.text()).trim();
	await $`sudo iptables -I OUTPUT -m owner --uid-owner ${uid} -j DROP`;
	faultLog.push({ ...f, droppedAt: Date.now() });
	await Bun.sleep(f.downS * 1000);
	await $`sudo iptables -D OUTPUT -m owner --uid-owner ${uid} -j DROP`;
	faultLog.push({ ...f, restoredAt: Date.now() });
};
await Promise.all([writer.exited, ...(scenario.faults ?? []).map(runFault)]);
await Promise.all([...procs.values()].map((p) => p.exited));

if (existsSync(replicaDir))
	await $`sh -c ${`cp ${replicaDir}/reader-*.json ${runDir}/ 2>/dev/null || true`}`;
writeFileSync(
	join(runDir, "scenario.json"),
	JSON.stringify({ scenario, faultLog, url: dbUrl({ db: scenario.db }) }),
);
await $`du -sh ${replicaDir}`.nothrow();
await $`bun ${join(here, "analyze.ts")} ${runDir}`;
rmSync(replicaDir, { recursive: true, force: true });
