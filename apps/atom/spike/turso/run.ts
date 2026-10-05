import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** Blip readers run inside the "blip" netns from setup-netns.sh; dropping its forwarded traffic cuts off only them. */
const BLIP_NETNS = "blip";
const BLIP_SUBNET = "10.77.0.0/24";

const here = import.meta.dir;
const scenario: Scenario = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const runId = `${scenario.name}-${Date.now()}`;
const runDir = join(
	process.env.SPIKE_OUT ?? `${process.env.HOME}/.capy/work/turso/runs`,
	runId,
);
const replicaDir = `/tmp/turso-replicas/${runId}`;
mkdirSync(runDir, { recursive: true });
mkdirSync(replicaDir, { recursive: true });

const isBlipReader = (i: number) =>
	scenario.faults?.some((f) => f.type === "blip" && f.reader === i) ?? false;

const spawnReader = (i: number, incarnation: number, seconds: number) => {
	const params = {
		db: scenario.db,
		engine: scenario.engine,
		file: join(replicaDir, `replica-${i}.db`),
		out: join(runDir, `reader-${i}-${incarnation}.json`),
		seconds,
		pollMs: scenario.pollMs,
		keys: scenario.writer.keys,
		pointReads: scenario.pointReads ?? 5000,
	};
	const cmd = ["bun", join(here, "reader.ts"), JSON.stringify(params)];
	const user = process.env.USER ?? "user";
	const home = process.env.HOME!;
	const inNetns = [
		"sudo",
		"ip",
		"netns",
		"exec",
		BLIP_NETNS,
		"sudo",
		"-u",
		user,
		"env",
		`HOME=${home}`,
		`PATH=${process.env.PATH}`,
	];
	return Bun.spawn(isBlipReader(i) ? [...inNetns, ...cmd] : cmd, {
		stdout: "inherit",
		stderr: "inherit",
	});
};

const admin = createClient({
	url: dbUrl({ db: scenario.db }).replace("libsql://", "https://"),
	authToken: dbToken({ db: scenario.db, access: "full" }),
});
await admin.batch(SUBJECT_STATES_DDL, "write");
admin.close();

const startedAt = Date.now();
const readers = new Map<number, ReturnType<typeof spawnReader>>();
for (let i = 0; i < scenario.readers; i++)
	readers.set(i, spawnReader(i, 0, scenario.seconds));

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

const faultLog: Record<string, unknown>[] = [];
const runFault = async (f: Fault) => {
	await Bun.sleep(f.atS * 1000);
	if (f.type === "restart") {
		readers.get(f.reader)!.kill(9);
		faultLog.push({ ...f, killedAt: Date.now() });
		await Bun.sleep(f.downS * 1000);
		const secondsLeft = scenario.seconds - (Date.now() - startedAt) / 1000;
		readers.set(f.reader, spawnReader(f.reader, 1, secondsLeft));
		faultLog.push({ ...f, restartedAt: Date.now() });
		return;
	}
	await $`sudo iptables -I FORWARD -s ${BLIP_SUBNET} -j DROP`;
	faultLog.push({ ...f, droppedAt: Date.now() });
	await Bun.sleep(f.downS * 1000);
	await $`sudo iptables -D FORWARD -s ${BLIP_SUBNET} -j DROP`;
	faultLog.push({ ...f, restoredAt: Date.now() });
};
await Promise.all([writer.exited, ...(scenario.faults ?? []).map(runFault)]);
await Promise.all([...readers.values()].map((p) => p.exited));

writeFileSync(
	join(runDir, "scenario.json"),
	JSON.stringify({ scenario, faultLog }),
);
await $`du -sh ${replicaDir}`.nothrow();
await $`bun ${join(here, "analyze.ts")} ${runDir}`;
rmSync(replicaDir, { recursive: true, force: true });
