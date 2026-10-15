/**
 * Driver box, rolling-deploy mode: steady load on both replicas, then each replica swapped the way Alien swaps a
 * container (rigConfig.roll: deregister, 12 s, SIGTERM, exit, DNS drop, restart on the same data dir, DNS add, ready,
 * registered), with every second's answered / forwarded / failed counts kept per owner class and the stub's applied
 * deductions reconciled against the clients' (P1). `bun run rig:roll --replicas <ipA>,<ipB> [--out <dir>]`.
 */
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { LATEST_VERSION } from "@autumn/shared";
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
	percentileOf,
	type RollCounts,
	type RollLoadPlan,
	type RollLockCounts,
	type RollRouting,
} from "./rigShared.js";
import {
	detectTwoOwner,
	type HandIn,
	swapDurationsOf,
	swapWindowsOf,
	windowBarsOf,
} from "./rigTwoOwner.js";

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
		hot:
			roll.hotDeductionsPerSec > 0
				? {
						customerId: config.customers.hotCustomerId,
						deductionsPerSec: roll.hotDeductionsPerSec / config.loadProcesses,
						readChecksPerDeduction: config.hot.readChecksPerDeduction,
					}
				: null,
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

let routed: OwnerClass[] = ["a", "b"];
const route = (to: OwnerClass[]) => {
	routed = to;
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

type ThreadView = { index: number; ready: boolean; handoffLate?: number };
/** The replica's /health thread list now: how many threads it runs and which are ready. */
const threadsOf = async (replica: OwnerClass) =>
	fetch(`${replicaUrls[replica]}/health`, {
		signal: AbortSignal.timeout(2_000),
	})
		.then(async (reply) => {
			const health = (await reply.json()) as { threads?: ThreadView[] };
			return (health.threads ?? []).map(({ index, ready }) => ({
				index,
				ready,
			}));
		})
		.catch((error) => String(error));

const statusOf = async (replica: OwnerClass) =>
	(await (await fetch(`${controlUrls[replica]}/status`)).json()) as {
		readyAt: number | null;
		exitedAt: number | null;
		now: number;
		chaos: Record<string, number | string | boolean | null>;
	};

const waitReady = async (replica: OwnerClass) => {
	for (;;) {
		const status = await statusOf(replica);
		if (status.readyAt) {
			mark(`${replica} ready`, status.readyAt);
			return;
		}
		if (status.exitedAt) throw new Error(`${replica} died while starting`);
		await Bun.sleep(STATUS_POLL_MS);
	}
};

/** The leaver's chaos before its SIGTERM; marks what the supervisor did once it has exited. */
const KILL_PATTERN = '"type":"atom_handoff".*"handed":[1-9]';
let killArmed = false;
let outageStarted = false;
/** Autumn's worker down or slow from the roll's first SIGTERM (stub.outage). */
const startOutage = async () => {
	const { outage } = config.stub;
	if (outage.mode === "none" || outageStarted) return;
	outageStarted = true;
	const reply = await fetch(`${stubUrl}/__rig/outage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(outage),
	});
	const { from, until } = (await reply.json()) as {
		from: number;
		until: number;
	};
	mark(`stub ${outage.mode} on`, from);
	setTimeout(() => mark(`stub ${outage.mode} off`, until), until - Date.now());
};

/** Long locks on the hot customer, one per swap, each taken before the SIGTERM and finalized after it. */
const longLocks: Record<string, unknown>[] = [];
const longLockRuns: Promise<void>[] = [];
const sendLongLock = async (
	path: string,
	body: Record<string, unknown>,
	key?: string,
) => {
	const to = routed[Math.floor(Math.random() * routed.length)] ?? "a";
	try {
		const reply = await fetch(`${replicaUrls[to]}${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${config.tenant.secretKey}`,
				"x-atom-token": config.tenant.token,
				"x-api-version": LATEST_VERSION,
				...(key && { "idempotency-key": key }),
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(config.requestTimeoutMs),
		});
		const answer = (await reply.json().catch(() => null)) as {
			allowed?: boolean;
			code?: string;
		} | null;
		return {
			to,
			status: reply.status,
			allowed: answer?.allowed ?? null,
			code: answer?.code ?? null,
			forwarded: reply.headers.get("x-atom-forwarded"),
			proxied: reply.headers.get("x-atom-proxied"),
		};
	} catch (error) {
		return {
			to,
			status: 0,
			allowed: null,
			code: String(error),
			forwarded: null,
			proxied: null,
		};
	}
};
const longLock = (index: number) => {
	const key = `long-${index}`;
	const lockId = `lock-${key}`;
	const customerId = config.customers.hotCustomerId;
	const takenAt = Date.now();
	const run = (async () => {
		const take = await sendLongLock(
			"/v1/balances.check",
			{
				customer_id: customerId,
				feature_id: "messages",
				required_balance: 1,
				send_event: true,
				lock: { enabled: true, lock_id: lockId },
			},
			key,
		);
		mark(`long lock ${index} taken ${take.status} ${take.to}`, takenAt);
		const took = take.status === 200 && take.allowed === true;
		if (took) {
			keys.allowed.push(key);
			locks.taken++;
		} else if (take.status !== 200) {
			keys.ambiguous.push(key);
			add(locks.takeFailed, `long ${take.status} ${take.code ?? ""}`);
		}
		keys.sends[key] = [{ ...take, replay: false, long: true }];
		await sleepUntil(takenAt + roll.longLockMs);
		const finalize = took
			? await sendLongLock("/v1/balances.finalize", {
					customer_id: customerId,
					lock_id: lockId,
					action: "release",
				})
			: null;
		if (finalize) {
			mark(`long lock ${index} finalized ${finalize.status} ${finalize.to}`);
			if (finalize.forwarded) add(locks.finalizeForwarded, finalize.forwarded);
			else if (finalize.status === 200) locks.finalized++;
			else
				add(
					locks.finalizeFailed,
					`long ${finalize.status} ${finalize.code ?? ""}`,
				);
		}
		longLocks.push({ key, lockId, takenAt, take, finalize });
	})();
	longLockRuns.push(run);
};
const add = (record: Record<string, number>, key: string) => {
	record[key] = (record[key] ?? 0) + 1;
};
const armChaos = async (replica: OwnerClass) => {
	if (roll.chaos === "netem-handoff") {
		const on = await control(replica, "/netem", {
			delayMs: roll.netemDelayMs,
			durationMs: 60_000,
			port: config.replica.peerPort,
		}).catch((error) => ({ error: String(error), at: null }));
		mark(
			on.at
				? `${replica} netem ${roll.netemDelayMs}ms on`
				: `${replica} netem failed ${JSON.stringify(on)}`,
			typeof on.at === "number" ? on.at : Date.now(),
		);
	}
	const killing =
		(roll.chaos === "kill9-wipe" || roll.chaos === "kill9-handoff") &&
		replica === roll.order[0] &&
		!killArmed;
	if (killing) {
		killArmed = true;
		await control(replica, "/killOn", {
			pattern: KILL_PATTERN,
			wipe: roll.chaos === "kill9-wipe",
		});
		mark(`${replica} kill armed`);
	}
};
const markChaos = async (replica: OwnerClass) => {
	const { chaos } = await statusOf(replica);
	for (const [field, name] of [
		["netemClearedAt", "netem cleared"],
		["killedAt", "killed"],
		["wipedAt", "wiped"],
	] as const)
		if (typeof chaos[field] === "number")
			mark(`${replica} ${name}`, chaos[field] as number);
};

const sleepUntil = async (at: number) => {
	const ms = at - Date.now();
	if (ms > 0) await Bun.sleep(ms);
};

/** One replica swapped as Alien swaps a container, each step at its measured offset; the other keeps serving. */
type SwapPlan = {
	replica: OwnerClass;
	env?: Record<string, string>;
	src?: number;
};
const swapPlan: SwapPlan[] = roll.swaps.length
	? roll.swaps
	: Array.from({ length: roll.repeat }, (_, round) =>
			roll.order.map((replica) => ({ replica, env: roll.restartEnv[round] })),
		).flat();
/** Per swap: what restarted, from which src, and both replicas' /health thread lists around it. */
const swapDetails: Record<string, unknown>[] = [];
let swapIndex = 0;

/** Polls the restarted replica's public port until it answers anything (503 starting included). */
const waitPortOpen = async (replica: OwnerClass) => {
	for (;;) {
		const status = await fetch(`${replicaUrls[replica]}/health`, {
			signal: AbortSignal.timeout(1_000),
		})
			.then((reply) => reply.status)
			.catch(() => 0);
		if (status !== 0) return status;
		await Bun.sleep(20);
	}
};

const swap = async (
	replica: OwnerClass,
	{
		sigtermAtOnce = false,
		registerAtReady = false,
		env,
		src,
	}: {
		sigtermAtOnce?: boolean;
		registerAtReady?: boolean;
		env?: Record<string, string>;
		src?: number;
	} = {},
) => {
	const index = swapIndex++;
	const other: OwnerClass = replica === "a" ? "b" : "a";
	const detail: Record<string, unknown> = {
		index,
		replica,
		env: env ?? null,
		src: src ?? null,
		threadsBefore: await threadsOf(replica),
		peerThreadsBefore: await threadsOf(other),
	};
	swapDetails.push(detail);
	const deregisterMs = roll.deregisterOffsetMs ?? roll.deregisterToSigtermMs;
	const routeUntilExit = !sigtermAtOnce && deregisterMs === 0;
	if (roll.longLockMs > 0) {
		longLock(index);
		const lead = roll.longLockMs / 2 - (routeUntilExit ? 0 : deregisterMs);
		if (lead > 0) await Bun.sleep(lead);
	}
	if (!routeUntilExit) {
		route([other]);
		mark(`${replica} deregistered`);
		if (!sigtermAtOnce) await Bun.sleep(deregisterMs);
	}
	await armChaos(replica);
	void startOutage();
	const stopped = await control(replica, "/stop");
	mark(`${replica} sigterm`, stopped.sigtermAt ?? Date.now());
	const exitedAt = stopped.exitedAt ?? Date.now();
	mark(`${replica} exited`, exitedAt);
	if (routeUntilExit) {
		route([other]);
		mark(`${replica} deregistered`);
	}
	await markChaos(replica);
	await sleepUntil(exitedAt + roll.exitToDnsDropMs);
	await control(other, "/peers", { peers: [] });
	mark(`${replica} dns drop`);
	await Bun.sleep(roll.dnsDropToStartMs);
	const started = (await control(replica, "/start", {
		peers: [members[other]],
		...(env && { env }),
		...(src !== undefined && { src }),
	})) as unknown as { startedAt?: number; sha?: string; srcDir?: string };
	mark(`${replica} started`, started.startedAt ?? Date.now());
	mark(
		`${replica} src ${src ?? "arm"} ${started.sha ?? "?"} env ${JSON.stringify(env ?? {})}`,
	);
	detail.sha = started.sha;
	detail.srcDir = started.srcDir;
	await control(other, "/peers", { peers: [members[replica]] });
	mark(`${replica} dns add`);
	if (roll.sendBeforeReady) {
		const status = await waitPortOpen(replica);
		route(["a", "b"]);
		mark(`${replica} port open ${status}`);
	}
	await waitReady(replica);
	detail.threadsAfter = await threadsOf(replica);
	detail.peerThreadsAfter = await threadsOf(other);
	if (registerAtReady) return;
	await Bun.sleep(roll.readyToRegisteredMs);
	route(["a", "b"]);
	mark(`${replica} registered`);
};

/** Host loss: SIGKILL with no roll in progress, the ALB still sending to it, restarted on the same data dir. */
const killMidTraffic = async () => {
	const replica = roll.order[0] as OwnerClass;
	const other: OwnerClass = replica === "a" ? "b" : "a";
	await sleepUntil(startAt + roll.killAtSeconds * 1000);
	swapDetails.push({
		index: swapIndex++,
		replica,
		threadsBefore: await threadsOf(replica),
	});
	const killed = await control(replica, "/kill");
	mark(`${replica} kill9`, killed.killedAt ?? Date.now());
	await Bun.sleep(roll.killRestartMs);
	const started = await control(replica, "/start", { peers: [members[other]] });
	mark(`${replica} started`, started.startedAt ?? Date.now());
	await waitReady(replica);
	await Bun.sleep(roll.readyToRegisteredMs);
	mark(`${replica} registered`);
};

/** H8: both replicas leave at once (A's SIGTERM, then B's `bothSigtermGapMs` later), then both come back. */
const swapBoth = async () => {
	route(["b"]);
	mark("a deregistered");
	await Bun.sleep(roll.deregisterToSigtermMs);
	const exits = await Promise.all(
		(["a", "b"] as const).map(async (replica, index) => {
			if (index > 0) await Bun.sleep(roll.bothSigtermGapMs);
			const stopped = await control(replica, "/stop");
			mark(`${replica} sigterm`, stopped.sigtermAt ?? Date.now());
			mark(`${replica} exited`, stopped.exitedAt ?? Date.now());
			return stopped.exitedAt ?? Date.now();
		}),
	);
	await sleepUntil(Math.max(...exits) + roll.exitToDnsDropMs);
	for (const replica of ["a", "b"] as const)
		await control(replica, "/peers", { peers: [] });
	mark("a+b dns drop");
	await Bun.sleep(roll.dnsDropToStartMs);
	for (const replica of ["a", "b"] as const) {
		const started = await control(replica, "/start", {
			peers: [members[replica === "a" ? "b" : "a"]],
		});
		mark(`${replica} started`, started.startedAt ?? Date.now());
	}
	mark("a+b dns add");
	const registered: OwnerClass[] = [];
	await Promise.all(
		(["a", "b"] as const).map(async (replica) => {
			await waitReady(replica);
			await Bun.sleep(roll.readyToRegisteredMs);
			registered.push(replica);
			route([...registered]);
			mark(`${replica} registered`);
		}),
	);
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
	{ counts: Record<OwnerClass | "hot", RollCounts>; from: number }
>();
const keys = {
	allowed: [] as string[],
	ambiguous: [] as string[],
	sends: {} as Record<string, Record<string, unknown>[]>,
	firsts: new Map<string, unknown[]>(),
};
const locks = emptyRollLockCounts();
const receive = (line: {
	type: string;
	second?: number;
	a?: RollCounts;
	b?: RollCounts;
	hot?: RollCounts;
	allowed?: string[];
	ambiguous?: string[];
	sends?: Record<string, Record<string, unknown>[]>;
	firsts?: unknown[][];
	locks?: RollLockCounts;
}) => {
	if (line.type === "locks" && line.locks) {
		mergeRollLockCounts(locks, line.locks);
		return;
	}
	if (line.type === "keys") {
		keys.allowed.push(...(line.allowed ?? []));
		keys.ambiguous.push(...(line.ambiguous ?? []));
		Object.assign(keys.sends, line.sends ?? {});
		for (const first of line.firsts ?? [])
			keys.firsts.set(first[0] as string, first);
		return;
	}
	if (line.type !== "second" || line.second === undefined) return;
	const held = reported.get(line.second) ?? {
		counts: {
			a: emptyRollCounts(),
			b: emptyRollCounts(),
			hot: emptyRollCounts(),
		},
		from: 0,
	};
	if (line.a) mergeRollCounts(held.counts.a, line.a);
	if (line.b) mergeRollCounts(held.counts.b, line.b);
	if (line.hot) mergeRollCounts(held.counts.hot, line.hot);
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
mark(`chaos ${roll.chaos}`);
if (roll.chaos === "both-sigterm") await swapBoth();
else if (roll.chaos === "kill9-traffic") await killMidTraffic();
else if (roll.chaos === "sigterm-b-at-health") {
	const [first, second] = roll.order as [OwnerClass, OwnerClass];
	await swap(first, { registerAtReady: true });
	mark(`${first} registered`);
	await swap(second, { sigtermAtOnce: true });
} else
	for (const { replica, env, src } of swapPlan)
		await swap(replica, { env, src });
await Bun.sleep(roll.settleSeconds * 1000);
mark("load stopping");
tellLoads({ type: "stop" });
await reading;
await Promise.all(longLockRuns);
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
/** A doubled key one send of which the API took: the stub has no worker claim, so the Atom's hand-in applies it again. */
const doubledAfterForward = doubled.filter((key) =>
	(keys.sends[key] ?? []).some((send) => send.forwarded),
);
writeFileSync(
	join(outDir, "lost-keys.json"),
	JSON.stringify(
		lost.map((key) => ({
			key,
			first: keys.firsts.get(key),
			sends: keys.sends[key] ?? [],
		})),
	),
);
writeFileSync(
	join(outDir, "doubled-keys.json"),
	JSON.stringify(
		doubled.map((key) => ({
			key,
			applied: appliedCount.get(key),
			sends: keys.sends[key] ?? [],
		})),
	),
);
/** The two-owner detector: every hand-in the stub took, whose writer it was by each box's journals, and the swap windows. */
const handIns = (
	(await (await fetch(`${stubUrl}/__rig/handins`)).json()) as {
		handIns: HandIn[];
	}
).handIns;
writeFileSync(join(outDir, "handins.json"), JSON.stringify(handIns));
const writers: Record<OwnerClass, string[]> = { a: [], b: [] };
const clockSkewMs: Record<string, number | string> = {};
for (const replica of ["a", "b"] as const) {
	writers[replica] = await fetch(`${controlUrls[replica]}/writers`)
		.then(
			async (reply) => ((await reply.json()) as { writers: string[] }).writers,
		)
		.catch(() => []);
	const sentAt = Date.now();
	const status = await statusOf(replica).catch(() => null);
	clockSkewMs[replica] = status
		? status.now - (sentAt + Date.now()) / 2
		: "unreachable";
}
const replicaOfWriter: Record<string, OwnerClass> = Object.fromEntries([
	...writers.a.map((writerId) => [writerId, "a"]),
	...writers.b.map((writerId) => [writerId, "b"]),
]);
const windows = swapWindowsOf({ marks });
const readJsonl = <T>(file: string): T[] =>
	readFileSync(join(outDir, file), "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as T);
const twoOwner = detectTwoOwner({ handIns, replicaOfWriter, windows });
const windowBars = windowBarsOf({
	windows,
	seconds: readJsonl<{
		type: string;
		second: number;
		a: RollCounts;
		b: RollCounts;
	}>("roll.jsonl").filter((line) => line.type === "second"),
	health: readJsonl("health.jsonl"),
	startAt,
});

/** Per window, each side's handoff log lines: one atom_handoff + one announcement per sender thread. */
const handoffLinesOf = async (replica: OwnerClass) =>
	fetch(`${controlUrls[replica]}/handoffs`)
		.then(
			async (reply) =>
				(
					(await reply.json()) as {
						lines: {
							time: number;
							type: string;
							data?: Record<string, unknown>;
						}[];
					}
				).lines,
		)
		.catch(() => []);
const handoffLines = {
	a: await handoffLinesOf("a"),
	b: await handoffLinesOf("b"),
};
const handoffAnnouncements = windows.map((window, index) => {
	const peer: OwnerClass = window.replica === "a" ? "b" : "a";
	const inside = (replica: OwnerClass) =>
		handoffLines[replica].filter(
			(line) => line.time >= window.from && line.time <= window.to,
		);
	const tally = (replica: OwnerClass) => {
		const lines = inside(replica);
		const count = (type: string) =>
			lines.filter((line) => line.type === type).length;
		const sum = (type: string, field: string) =>
			lines
				.filter((line) => line.type === type)
				.reduce((n, line) => n + Number(line.data?.[field] ?? 0), 0);
		return {
			atom_handoff: count("atom_handoff"),
			atom_leaving: count("atom_leaving"),
			atom_peer_handed: count("atom_peer_handed"),
			/** One per thread of this side that handed the other replica (the joiner, or the leaver's peer) its share. */
			handedToOther: lines.filter(
				(line) =>
					line.type === "atom_peer_handed" &&
					line.data?.peer === members[replica === "a" ? "b" : "a"],
			).length,
			atom_peer_joined: count("atom_peer_joined"),
			unannounced:
				count("atom_leave_unannounced") + count("atom_grant_unannounced"),
			inFlightWarnings: count("atom_handover_in_flight"),
			handed: sum("atom_handoff", "handed"),
			kept: sum("atom_handoff", "kept"),
		};
	};
	const detail = swapDetails.filter((d) => d.replica === window.replica)[
		windows.slice(0, index).filter((w) => w.replica === window.replica).length
	];
	const countOf = (threads: unknown) =>
		Array.isArray(threads) ? threads.length : null;
	const leaverThreads = countOf(detail?.threadsBefore);
	const standInThreads = countOf(detail?.peerThreadsBefore);
	const leaver = tally(window.replica);
	const standIn = tally(peer);
	return {
		replica: window.replica,
		leaverThreads,
		standInThreads,
		joinerThreads: countOf(detail?.threadsAfter),
		leaver,
		standIn,
		/** Every leaver thread announced its leave, and every stand-in thread handed the joiner its share. */
		leaveComplete:
			leaverThreads !== null && leaver.atom_leaving === leaverThreads,
		joinComplete:
			standInThreads !== null && standIn.handedToOther >= standInThreads,
	};
});
const hotSeconds = readJsonl<{
	type: string;
	second: number;
	hot?: RollCounts;
}>("roll.jsonl").filter(
	(line) => line.type === "second" && line.hot && line.hot.sent > 0,
);
const hot =
	roll.hotDeductionsPerSec > 0
		? hotSeconds.reduce(
				(into, line) => mergeRollCounts(into, line.hot as RollCounts),
				emptyRollCounts(),
			)
		: null;

const summary = {
	marks,
	chaos: roll.chaos,
	swapPlan,
	swapDetails,
	handoffAnnouncements,
	longLocks,
	hot: hot && {
		customerId: config.customers.hotCustomerId,
		targetPerSec: roll.hotDeductionsPerSec,
		seconds: hotSeconds.length,
		sent: hot.sent,
		answered: hot.answered,
		allowed: hot.allowed,
		forwarded: hot.forwarded,
		forwardReasons: hot.forwardReasons,
		failedStatus: hot.failedStatus,
		shed: hot.failedStatus["503 atom_overloaded"] ?? 0,
		p50Ms: percentileOf({ histogram: hot.histogram, p: 0.5 }),
		p99Ms: percentileOf({ histogram: hot.histogram, p: 0.99 }),
	},
	twoOwner,
	windows: windowBars,
	swapDurations: swapDurationsOf({ marks }),
	writers,
	clockSkewMs,
	p1: {
		allowed: allowed.size,
		applied: appliedCount.size,
		lost: lost.length,
		doubled: doubled.length,
		doubledAfterForward: doubledAfterForward.length,
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
log(
	`twoOwner ${JSON.stringify({ events: twoOwner.events, customers: twoOwner.customers, perWindow: twoOwner.perWindow, outside: twoOwner.outside, unknownWriters: twoOwner.unknownWriters.length })}`,
);
log(`windows ${JSON.stringify(windowBars)}`);
if (locks.taken > 0)
	log(
		`locks ${JSON.stringify({ ...locks, stubFinalizes: summary.stub.finalizes, stubFinalizeDupes: summary.stub.finalizeDupes })}`,
	);
log(`done: ${outDir}/{meta.json,roll.jsonl,health.jsonl,summary.json}`);
process.exit(0);
