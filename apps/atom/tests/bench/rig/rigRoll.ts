/**
 * Driver box, rolling-deploy mode: steady load on both replicas, then each replica swapped the way Alien swaps a
 * container (rigConfig.roll: deregister, 12 s, SIGTERM, exit, DNS drop, restart on the same data dir, DNS add, ready,
 * registered), with every second's answered / forwarded / failed counts kept per owner class and the stub's applied
 * deductions reconciled against the clients' (P1). `bun run rig:roll --replicas <ipA>,<ipB> [--out <dir>]`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { rigConfig } from "./rigConfig.js";
import { log, startStubAndSeed } from "./rigSetup.js";
import {
	customerIdsOf,
	drawCustomerRate,
	emptyRollCounts,
	emptyRollLockCounts,
	mergeRollCounts,
	mergeRollLockCounts,
	type OwnerClass,
	type RollCounts,
	type RollLoadPlan,
	type RollLockCounts,
	type RollRouting,
} from "./rigShared.js";

const { values } = parseArgs({
	options: { replicas: { type: "string" }, out: { type: "string" } },
});
const [ipA, ipB] = (values.replicas ?? "").split(",").filter(Boolean);
if (!ipA || !ipB)
	throw new Error("Usage: rig:roll --replicas <replica A IP>,<replica B IP>");
const config = rigConfig;
const { roll } = config;
const members: Record<OwnerClass, string> = { a: ipA, b: ipB };
const replicaUrls: Record<OwnerClass, string> = {
	a: `http://${ipA}:${config.replica.port}`,
	b: `http://${ipB}:${config.replica.port}`,
};
const controlUrls: Record<OwnerClass, string> = {
	a: `http://${ipA}:${config.replica.controlPort}`,
	b: `http://${ipB}:${config.replica.controlPort}`,
};
const outDir =
	values.out ??
	join(
		homedir(),
		"atom-rig",
		"runs",
		`roll-${new Date().toISOString().replaceAll(":", "-")}`,
	);
mkdirSync(outDir, { recursive: true });
const writeLine = (file: string, line: unknown) =>
	appendFileSync(join(outDir, file), `${JSON.stringify(line)}\n`);
/** The run never outlives this, whatever a swap does. */
const MAX_RUN_S = 900;
const STATUS_POLL_MS = 100;

const { stubUrl } = await startStubAndSeed({
	replicaUrls: [replicaUrls.a, replicaUrls.b],
});

const customers = customerIdsOf({ config }).filter(
	(id) => id !== config.customers.hotCustomerId,
);
const draws = customers.map(() =>
	drawCustomerRate(config.background.ratePerCustomer),
);
const drawn = draws.reduce((sum, rate) => sum + rate, 0);
const scale = roll.deductionsPerSec / drawn;
const startAt = Date.now() + 3_000;
const secondOf = (at: number) => (at - startAt) / 1000;

const loads = Array.from({ length: config.loadProcesses }, (_, index) => {
	const slice = customers.flatMap((id, i) =>
		i % config.loadProcesses === index
			? [{ id, rate: (draws[i] as number) * scale }]
			: [],
	);
	const plan: RollLoadPlan = {
		index,
		replicaUrls,
		members,
		startAt,
		durationS: MAX_RUN_S,
		customerIds: slice.map(({ id }) => id),
		deductionsPerSec: slice.map(({ rate }) => rate),
		readChecksPerDeduction: roll.readChecksPerDeduction,
		lockEvery: roll.lockEvery,
		lockFinalizeAfterMs: roll.lockFinalizeAfterMs,
	};
	const planPath = join(outDir, `roll-plan-${index}.json`);
	writeFileSync(planPath, JSON.stringify(plan));
	return Bun.spawn(
		[process.execPath, join(import.meta.dir, "rigRollLoad.ts"), planPath],
		{ stdin: "pipe", stdout: "pipe", stderr: "inherit" },
	);
});

const tellLoads = (line: RollRouting | { type: "stop" }) => {
	const text = `${JSON.stringify(line)}\n`;
	for (const load of loads) {
		load.stdin.write(text);
		load.stdin.flush();
	}
};

const marks: { name: string; at: number; second: number }[] = [];
const mark = (name: string, at = Date.now()) => {
	const second = Number(secondOf(at).toFixed(3));
	marks.push({ name, at, second });
	writeLine("roll.jsonl", { type: "mark", name, at, second });
	log(`${second.toFixed(1).padStart(7)} s  ${name}`);
};

const route = (to: OwnerClass[]) => {
	tellLoads({ type: "route", to });
	mark(`route ${to.join("+")}`);
};

const control = async (
	replica: OwnerClass,
	path: string,
	body: Record<string, unknown> = {},
) => {
	const reply = await fetch(`${controlUrls[replica]}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!reply.ok)
		throw new Error(
			`${replica} ${path}: ${reply.status} ${await reply.text()}`,
		);
	return (await reply.json()) as Record<string, number | null>;
};

const statusOf = async (replica: OwnerClass) =>
	(await (await fetch(`${controlUrls[replica]}/status`)).json()) as {
		readyAt: number | null;
		exitedAt: number | null;
	};

const sleepUntil = async (at: number) => {
	const ms = at - Date.now();
	if (ms > 0) await Bun.sleep(ms);
};

/** One replica swapped as Alien swaps a container, each step at its measured offset; the other keeps serving. */
const swap = async (replica: OwnerClass) => {
	const other: OwnerClass = replica === "a" ? "b" : "a";
	route([other]);
	mark(`${replica} deregistered`);
	await Bun.sleep(roll.deregisterToSigtermMs);
	const stopped = await control(replica, "/stop");
	mark(`${replica} sigterm`, stopped.sigtermAt ?? Date.now());
	const exitedAt = stopped.exitedAt ?? Date.now();
	mark(`${replica} exited`, exitedAt);
	await sleepUntil(exitedAt + roll.exitToDnsDropMs);
	await control(other, "/peers", { peers: [] });
	mark(`${replica} dns drop`);
	await Bun.sleep(roll.dnsDropToStartMs);
	const started = await control(replica, "/start", {
		peers: [members[other]],
	});
	mark(`${replica} started`, started.startedAt ?? Date.now());
	await control(other, "/peers", { peers: [members[replica]] });
	mark(`${replica} dns add`);
	for (;;) {
		const status = await statusOf(replica);
		if (status.readyAt) {
			mark(`${replica} ready`, status.readyAt);
			break;
		}
		if (status.exitedAt) throw new Error(`${replica} died while starting`);
		await Bun.sleep(STATUS_POLL_MS);
	}
	await Bun.sleep(roll.readyToRegisteredMs);
	route(["a", "b"]);
	mark(`${replica} registered`);
};

const healthPolls = setInterval(async () => {
	for (const replica of ["a", "b"] as const) {
		const health = await fetch(`${replicaUrls[replica]}/health`)
			.then((reply) => reply.json())
			.catch((error) => ({ error: String(error) }));
		writeLine("health.jsonl", {
			at: new Date().toISOString(),
			second: secondOf(Date.now()),
			replica,
			health,
		});
	}
}, 2_000);

writeFileSync(
	join(outDir, "meta.json"),
	JSON.stringify(
		{
			mode: "roll",
			variant: config.variant,
			gitSha: Bun.spawnSync(["git", "rev-parse", "HEAD"])
				.stdout.toString()
				.trim(),
			driverBun: Bun.revision,
			replicaUrls,
			startAt: new Date(startAt).toISOString(),
			config,
		},
		null,
		2,
	),
);

/** Each second is written once every load process has reported it. */
const reported = new Map<
	number,
	{ counts: Record<OwnerClass, RollCounts>; from: number }
>();
const keys = { allowed: [] as string[], ambiguous: [] as string[] };
const locks = emptyRollLockCounts();
const receive = (line: {
	type: string;
	second?: number;
	a?: RollCounts;
	b?: RollCounts;
	allowed?: string[];
	ambiguous?: string[];
	locks?: RollLockCounts;
}) => {
	if (line.type === "locks" && line.locks) {
		mergeRollLockCounts(locks, line.locks);
		return;
	}
	if (line.type === "keys") {
		keys.allowed.push(...(line.allowed ?? []));
		keys.ambiguous.push(...(line.ambiguous ?? []));
		return;
	}
	if (line.type !== "second" || line.second === undefined) return;
	const held = reported.get(line.second) ?? {
		counts: { a: emptyRollCounts(), b: emptyRollCounts() },
		from: 0,
	};
	if (line.a) mergeRollCounts(held.counts.a, line.a);
	if (line.b) mergeRollCounts(held.counts.b, line.b);
	held.from++;
	reported.set(line.second, held);
	if (held.from < config.loadProcesses) return;
	writeLine("roll.jsonl", {
		type: "second",
		second: line.second,
		...held.counts,
	});
	reported.delete(line.second);
};

const reading = Promise.all(
	loads.map(async (load) => {
		let buffered = "";
		for await (const chunk of load.stdout) {
			buffered += new TextDecoder().decode(chunk);
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const text of lines) if (text.trim()) receive(JSON.parse(text));
		}
		await load.exited;
	}),
);

await sleepUntil(startAt);
mark("load started");
await Bun.sleep(roll.warmupSeconds * 1000);
for (const replica of roll.order) await swap(replica);
await Bun.sleep(roll.settleSeconds * 1000);
mark("load stopping");
tellLoads({ type: "stop" });
await reading;
clearInterval(healthPolls);

/** P1: every deduction a client saw allowed was applied once at the stub, and nothing else was. */
const stripTrack = (key: string) => key.replace(/^track:/, "");
const { applied } = (await (
	await fetch(`${stubUrl}/__rig/applied`)
).json()) as {
	applied: Record<string, number>;
};
const appliedCount = new Map<string, number>();
for (const [key, count] of Object.entries(applied))
	appliedCount.set(
		stripTrack(key),
		(appliedCount.get(stripTrack(key)) ?? 0) + count,
	);
const allowed = new Set(keys.allowed);
const ambiguous = new Set(keys.ambiguous);
const lost = keys.allowed.filter((key) => !appliedCount.has(key));
const doubled = [...appliedCount]
	.filter(([, count]) => count > 1)
	.map(([key]) => key);
const unexpected = [...appliedCount.keys()].filter(
	(key) => !allowed.has(key) && !ambiguous.has(key),
);
const ambiguousApplied = keys.ambiguous.filter((key) => appliedCount.has(key));
const summary = {
	marks,
	p1: {
		allowed: allowed.size,
		applied: appliedCount.size,
		lost: lost.length,
		doubled: doubled.length,
		unexpected: unexpected.length,
		ambiguous: ambiguous.size,
		ambiguousApplied: ambiguousApplied.length,
		exact: lost.length === 0 && doubled.length === 0 && unexpected.length === 0,
		samples: {
			lost: lost.slice(0, 5),
			doubled: doubled.slice(0, 5),
			unexpected: unexpected.slice(0, 5),
		},
	},
	locks,
	stub: await (await fetch(`${stubUrl}/__rig/stats`)).json(),
	replicas: {
		a: await statusOf("a").catch((error) => ({ error: String(error) })),
		b: await statusOf("b").catch((error) => ({ error: String(error) })),
	},
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
log(`P1 ${JSON.stringify(summary.p1)}`);
if (locks.taken > 0)
	log(
		`locks ${JSON.stringify({ ...locks, stubFinalizes: summary.stub.finalizes, stubFinalizeDupes: summary.stub.finalizeDupes })}`,
	);
log(`done: ${outDir}/{meta.json,roll.jsonl,health.jsonl,summary.json}`);
process.exit(0);
