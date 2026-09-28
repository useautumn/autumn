import type {
	ApiKey,
	Branch,
	Capacity,
	Catalog,
	Drift,
	EnqueueResponse,
	Job,
	KeysOverview,
	LiveClientMessage,
	LiveEvent,
	LiveServerMessage,
	Me,
	Reservation,
	RunDetail,
	RunEvent,
	RunFile,
	RunSummary,
	StripeAccount,
	StripeKey,
	WorkerState,
} from "../../../src/api/contract.ts";
import type { Method } from "../api/client.ts";
import fixture from "./catalogFixture.json";

// ---- deterministic randomness --------------------------------------------

const rng = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s: string) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++)
		h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
};
const rand = rng(7);
const pick = <T>(list: T[], r = rand) => list[Math.floor(r() * list.length)];
const hex = (n: number, r = rand) =>
	Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
const id = (prefix: string) => `${prefix}_${hex(12)}`;
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const START = Date.now();

// ---- people ---------------------------------------------------------------

const ME: Me = {
	userId: "usr_tanvir",
	email: "tanvir@useautumn.com",
	name: "Tanvir Ahmed",
	avatarUrl: null,
	via: "session",
};
const ACTORS = [
	{ userId: ME.userId, email: ME.email, via: "session" },
	{ userId: "usr_john", email: "john@useautumn.com", via: "session" },
	{ userId: "usr_ayush", email: "ayush@useautumn.com", via: "session" },
	{ userId: "usr_tanvir", email: ME.email, via: "api_key:ak_capy01" },
	{ userId: "usr_john", email: "john@useautumn.com", via: "api_key:ak_ci0042" },
];
const SYSTEM = {
	userId: "system",
	email: "system@useautumn.com",
	via: "system",
};

// ---- catalog --------------------------------------------------------------

const catalog: Catalog = (() => {
	const groupsByFile = new Map<string, string[]>();
	const suiteGroups = fixture.suites.flatMap((s) =>
		s.groups.map((g) => ({ suite: s.name, group: g })),
	);
	for (const g of fixture.groups) {
		const owners = [
			g.name,
			...suiteGroups.filter((s) => s.group === g.name).map((s) => s.suite),
		];
		for (const f of g.files)
			groupsByFile.set(f, [
				...new Set([...(groupsByFile.get(f) ?? []), ...owners]),
			]);
	}
	const groups: Catalog["groups"] = [
		...fixture.suites.map((s) => ({
			name: s.name,
			tier: "suite" as const,
			description: s.description,
			fileCount: new Set(
				fixture.groups
					.filter((g) => s.groups.includes(g.name))
					.flatMap((g) => g.files),
			).size,
		})),
		...fixture.groups.map((g) => ({
			name: g.name,
			tier: g.tier === "core" ? ("core" as const) : ("domain" as const),
			description: g.description.replace(/^⚠️\s*/, ""),
			fileCount: g.files.length,
		})),
	];
	const files = fixture.files.map((path) => {
		const r = rng(hash(path));
		const heavy =
			path.includes("e2e") || path.includes("migrat") || path.includes("sync");
		const base = 6_000 + r() * 40_000 + (heavy ? 60_000 + r() * 150_000 : 0);
		return {
			path,
			groups: groupsByFile.get(path) ?? [],
			baselineP90Ms: r() < 0.04 ? null : Math.round(base),
		};
	});
	return { groups, files };
})();
const p90 = new Map(catalog.files.map((f) => [f.path, f.baselineP90Ms]));
const groupFiles = new Map<string, string[]>();
for (const g of fixture.groups) groupFiles.set(g.name, g.files);
for (const s of fixture.suites)
	groupFiles.set(s.name, [
		...new Set(s.groups.flatMap((g) => groupFiles.get(g) ?? [])),
	]);

// ---- branches -------------------------------------------------------------

const branches: Branch[] = [
	{ name: "dev", sha: hex(40), prNumber: null, warm: "ready" },
	{ name: "main", sha: hex(40), prNumber: null, warm: "ready" },
	{ name: "feat/usage-alerts", sha: hex(40), prNumber: 3801, warm: "ready" },
	{
		name: "fix/cross-group-license-carry",
		sha: hex(40),
		prNumber: 3787,
		warm: "ready",
	},
	{
		name: "capy/schedule-license-quantities",
		sha: hex(40),
		prNumber: 3713,
		warm: "ready",
	},
	{
		name: "feat/multi-currency-topups",
		sha: hex(40),
		prNumber: 3794,
		warm: "building",
	},
	{
		name: "refactor/billing-plan-v3",
		sha: hex(40),
		prNumber: 3779,
		warm: "ready",
	},
	{
		name: "fix/proration-anchor-dst",
		sha: hex(40),
		prNumber: 3805,
		warm: "failed",
	},
	{ name: "chore/bump-stripe-sdk", sha: hex(40), prNumber: 3790, warm: "none" },
	{ name: "capy/twd", sha: hex(40), prNumber: 3810, warm: "building" },
	{
		name: "john/runner-fence-tokens",
		sha: hex(40),
		prNumber: null,
		warm: "ready",
	},
];

// ---- keys + accounts ------------------------------------------------------

const UNUSABLE: Record<number, string> = {
	17: "Invalid API key provided (rk_…) — key was rolled",
	88: "Account restricted: Connect platform profile incomplete",
	203: "Rate limited on every probe for 30 min",
	341: "Connect is not enabled on this platform account",
	412: "Invalid API key provided (sk_test_…) — key deleted",
};
const DISPLAY = [
	"Autumn Test",
	"Autumn Sandbox",
	"tw-swarm",
	"Autumn QA",
	null,
];

let gate: KeysOverview["gate"] = { state: "open", reason: null, jobId: null };

const keys = Array.from({ length: 445 }, (_, i) => {
	const r = rng(1000 + i);
	const unusableReason = UNUSABLE[i] ?? null;
	return {
		platformAccountId: `acct_1${hex(15, r).toUpperCase()}`,
		keyHint: `sk_test_…${hex(4, r)}`,
		displayName: DISPLAY[i % DISPLAY.length]
			? `${DISPLAY[i % DISPLAY.length]} ${i + 1}`
			: null,
		usable: unusableReason === null,
		unusableReason,
		webhookRegistered: unusableReason === null && i !== 256,
		present: i !== 412,
		probedAt: iso(START - (5 + r() * 50) * MIN),
	};
});

const accounts: StripeAccount[] = keys.flatMap((k, ki) =>
	k.usable
		? Array.from({ length: 3 }, (_, j) => ({
				id: `acc_${String(ki * 3 + j).padStart(5, "0")}`,
				platformAccountId: k.platformAccountId,
				state:
					ki % 97 === 5 && j === 2 ? ("broken" as const) : ("clean" as const),
				heldBy: null,
				runId: null,
				reservationId: null,
				reservedUntil: null,
				stateChangedAt: iso(START - rand() * 6 * HOUR),
			}))
		: [],
);

const claim = ({
	count,
	state,
	runId,
	reservationId,
	heldBy,
	until,
}: {
	count: number;
	state: StripeAccount["state"];
	runId?: string;
	reservationId?: string;
	heldBy?: string;
	until?: string;
}) => {
	const slot = (a: StripeAccount) => Number(a.id.slice(4)) % 3;
	const free = accounts
		.filter((a) => a.state === "clean")
		.sort((a, b) => slot(a) - slot(b) || a.id.localeCompare(b.id))
		.slice(0, count);
	for (const a of free) {
		a.state = state;
		a.runId = runId ?? null;
		a.reservationId = reservationId ?? null;
		a.heldBy = heldBy ?? null;
		a.reservedUntil = until ?? null;
		a.stateChangedAt = iso(Date.now());
	}
	return free.map((a) => a.id);
};

const releaseAccounts = (match: (a: StripeAccount) => boolean) => {
	for (const a of accounts.filter(match)) {
		a.state = "nuking";
		a.runId = null;
		a.reservationId = null;
		a.heldBy = null;
		a.reservedUntil = null;
		a.stateChangedAt = iso(Date.now());
		setTimeout(
			() => {
				a.state = "clean";
				a.stateChangedAt = iso(Date.now());
			},
			8_000 + rand() * 20_000,
		);
	}
};

const countStates = (list: StripeAccount[]) => ({
	clean: list.filter((a) => a.state === "clean").length,
	reserved: list.filter((a) => a.state === "reserved").length,
	inUse: list.filter((a) => a.state === "in_use").length,
	nuking: list.filter((a) => a.state === "nuking").length,
	broken: list.filter((a) => a.state === "broken").length,
});

const keysOverview = (): KeysOverview => {
	const byKey = new Map<string, StripeAccount[]>();
	for (const a of accounts)
		byKey.set(a.platformAccountId, [
			...(byKey.get(a.platformAccountId) ?? []),
			a,
		]);
	return {
		gate,
		keys: keys.map(
			(k): StripeKey => ({
				...k,
				accounts: countStates(byKey.get(k.platformAccountId) ?? []),
			}),
		),
	};
};

// ---- reservations ---------------------------------------------------------

const reservations: Reservation[] = [];
const createReservation = ({
	owner,
	count,
	ttlMs,
	note,
	createdAt = Date.now(),
}: {
	owner: Reservation["owner"];
	count: number;
	ttlMs: number;
	note: string | null;
	createdAt?: number;
}) => {
	const rid = id("rsv");
	const expiresAt = iso(createdAt + ttlMs);
	const accountIds = claim({
		count,
		state: "reserved",
		reservationId: rid,
		heldBy: owner.email,
		until: expiresAt,
	});
	const reservation: Reservation = {
		id: rid,
		owner,
		note,
		accountIds,
		expiresAt,
		releasedAt: null,
		createdAt: iso(createdAt),
	};
	reservations.unshift(reservation);
	return reservation;
};
createReservation({
	owner: ACTORS[3],
	count: 120,
	ttlMs: 2 * HOUR,
	note: "capy: bisecting proration flake",
	createdAt: START - 25 * MIN,
});
createReservation({
	owner: ACTORS[1],
	count: 40,
	ttlMs: 6 * HOUR,
	note: "local multi-currency e2e",
	createdAt: START - 3 * HOUR,
});
reservations.push({
	id: id("rsv"),
	owner: ACTORS[2],
	note: "load test dry-run",
	accountIds: Array.from(
		{ length: 200 },
		(_, i) => `acc_${String(i + 900).padStart(5, "0")}`,
	),
	expiresAt: iso(START - 20 * HOUR),
	releasedAt: iso(START - 22 * HOUR),
	createdAt: iso(START - 26 * HOUR),
});

// ---- jobs -----------------------------------------------------------------

const jobs: Job[] = [];
const enqueue = (kind: Job["kind"], singletonKey: string): EnqueueResponse => {
	const live = jobs.find(
		(j) =>
			j.singletonKey === singletonKey &&
			(j.status === "queued" || j.status === "running"),
	);
	if (live) return { job: live, deduped: true };
	const job: Job = {
		id: id("job"),
		kind,
		singletonKey,
		status: "running",
		error: null,
		attempts: 1,
		createdBy: { userId: ME.userId, email: ME.email, via: ME.via },
		createdAt: iso(Date.now()),
		startedAt: iso(Date.now()),
		finishedAt: null,
	};
	jobs.unshift(job);
	return { job, deduped: false };
};

// ---- runs -----------------------------------------------------------------

type Sim = { queue: string[]; logSeq: number };
const runs: RunDetail[] = [];
const sims = new Map<string, Sim>();
const emit = (runId: string, event: RunEvent) =>
	publish(`run:${runId}`, { type: "run.event", runId, event });

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const isLive = (r: RunSummary) => !TERMINAL.has(r.status);

const FAILURES = [
	"expect(received).toBe(expected)\n  Expected: 2000\n  Received: 1000\n    at balances/track/track-overage.test.ts:88",
	"Stripe InvalidRequestError: No such subscription_item: 'si_Qx81…'",
	"Timed out after 120000ms waiting for webhook customer.subscription.updated",
	"expect(invoice.total).toEqual(4900)\n  Received: 4899 (rounding on proration)",
	"TypeError: Cannot read properties of undefined (reading 'entitlements')",
];

const filesForSelection = (sel: RunSummary["selection"]) => {
	const set = new Set<string>();
	for (const g of sel.groups ?? [])
		for (const f of groupFiles.get(g) ?? []) set.add(f);
	for (const f of sel.files ?? []) set.add(f);
	let list = [...set];
	if (sel.grep) list = list.filter((f) => f.includes(sel.grep ?? ""));
	return list.sort(
		(a, b) =>
			(p90.get(b) ?? Number.MAX_SAFE_INTEGER) -
			(p90.get(a) ?? Number.MAX_SAFE_INTEGER),
	);
};

const workerName = (i: number) => `w${String(i + 1).padStart(3, "0")}`;

const finishedFile = (
	file: string,
	r: () => number,
	worker: string,
	failRate: number,
): RunFile => {
	const base = p90.get(file) ?? 30_000;
	const failed = r() < failRate;
	const slow = r() < 0.02;
	const tests = 2 + Math.floor(r() * 14);
	const failedTests = failed ? 1 + Math.floor(r() * 2) : 0;
	return {
		file,
		status: failed ? (r() < 0.15 ? "crashed" : "failed") : "passed",
		durationMs: Math.round(base * (slow ? 1.7 + r() : 0.55 + r() * 0.5)),
		attempt: failed && r() < 0.5 ? 2 : 1,
		passedTests: tests - failedTests,
		failedTests,
		worker,
		failureSummary: failed ? pick(FAILURES, r) : null,
	};
};

const computeDrift = (files: RunFile[]): Drift[] =>
	files.flatMap((f): Drift[] => {
		const base = p90.get(f.file);
		const r = rng(hash(f.file));
		if ((f.status === "failed" || f.status === "crashed") && r() < 0.7)
			return [
				{
					file: f.file,
					kind: "new_failure",
					branchValue: 0,
					baselineValue: 0.96 + r() * 0.04,
				},
			];
		if (f.durationMs && base && f.durationMs > base * 1.5)
			return [
				{
					file: f.file,
					kind: "slow",
					branchValue: f.durationMs,
					baselineValue: base,
				},
			];
		return [];
	});

const summarize = (run: RunDetail) => {
	run.passed = run.files.filter((f) => f.status === "passed").length;
	run.failed = run.files.filter(
		(f) => f.status === "failed" || f.status === "crashed",
	).length;
	run.drift = computeDrift(run.files);
};

const makeFinishedRun = (i: number): RunDetail => {
	const r = rng(500 + i);
	const branch = i % 4 === 0 ? branches[0] : pick(branches.slice(2), r);
	const baseline = branch.name === "dev" && i % 8 === 0;
	const selection = baseline
		? { groups: ["core", ...fixture.suites[1].groups] }
		: pick(
				[
					{ groups: ["core"] },
					{ groups: ["core-attach", "core-balances"] },
					{ groups: ["billing"] },
					{ groups: ["pre-merge"] },
					{ files: filesForSelection({ groups: ["track"] }).slice(0, 12) },
					{ groups: ["webhooks"], grep: "webhook" },
				],
				r,
			);
	const list = filesForSelection(selection);
	const workerCount = Math.min(list.length, 40 + Math.floor(r() * 160));
	const failRate = r() < 0.45 ? 0 : 0.004 + r() * 0.02;
	const createdAt = START - (i + 1) * (2.3 * HOUR) - r() * HOUR;
	const startedAt = createdAt + (40 + r() * 80) * 1000;
	const files = list.map((f, j) =>
		finishedFile(f, r, workerName(j % workerCount), failRate),
	);
	const wall = Math.max(0, ...files.map((f) => f.durationMs ?? 0)) + 90_000;
	const cancelled = i === 6;
	const run: RunDetail = {
		id: `run_${hex(10, r)}`,
		branch: branch.name,
		sha: hex(40, r),
		status: cancelled ? "cancelled" : "passed",
		purpose: baseline ? "baseline" : "adhoc",
		selection,
		fileCount: list.length,
		workerCount,
		passed: 0,
		failed: 0,
		createdBy: baseline ? SYSTEM : pick(ACTORS, r),
		createdAt: iso(createdAt),
		startedAt: iso(startedAt),
		finishedAt: iso(startedAt + (cancelled ? wall / 3 : wall)),
		phase: null,
		workers: Array.from({ length: workerCount }, (_, w) => ({
			name: workerName(w),
			status: "dead" as const,
			file: null,
		})),
		files: cancelled ? files.slice(0, Math.floor(files.length / 3)) : files,
		drift: [],
	};
	summarize(run);
	if (!cancelled && run.failed > 0) run.status = "failed";
	return run;
};

for (let i = 0; i < 18; i++) runs.push(makeFinishedRun(i));

const startLiveRun = ({
	branch,
	sha,
	selection,
	createdBy,
	progress = 0,
	workerCap = 40,
	purpose = "adhoc",
}: {
	branch: string;
	sha: string;
	selection: RunSummary["selection"];
	createdBy: RunSummary["createdBy"];
	progress?: number;
	workerCap?: number;
	purpose?: RunSummary["purpose"];
}) => {
	const list = filesForSelection(selection);
	const workerCount = Math.min(list.length, workerCap);
	const runId = `run_${hex(10)}`;
	const createdAt = Date.now() - progress * 11 * MIN;
	const done = Math.floor(list.length * progress);
	const files: RunFile[] = list
		.slice(0, done)
		.map((f, j) => finishedFile(f, rand, workerName(j % workerCount), 0.012));
	const running = progress > 0 ? list.slice(done, done + workerCount) : [];
	const run: RunDetail = {
		id: runId,
		branch,
		sha,
		status: progress > 0 ? "running" : "queued",
		purpose,
		selection,
		fileCount: list.length,
		workerCount,
		passed: 0,
		failed: 0,
		createdBy,
		createdAt: iso(createdAt),
		startedAt: progress > 0 ? iso(createdAt + 70_000) : null,
		finishedAt: null,
		phase:
			progress > 0
				? `running ${done}/${list.length}`
				: "waiting for warm image",
		workers: Array.from({ length: workerCount }, (_, w) => ({
			name: workerName(w),
			status: running[w]
				? ("busy" as const)
				: progress > 0
					? ("ready" as const)
					: ("provisioning" as const),
			file: running[w] ?? null,
		})),
		files: [
			...files,
			...running.map((file, w) => ({
				file,
				status: "running" as const,
				durationMs: null,
				attempt: 1,
				passedTests: 0,
				failedTests: 0,
				worker: workerName(w),
				failureSummary: null,
			})),
		],
		drift: [],
	};
	summarize(run);
	claim({
		count: workerCount,
		state: "in_use",
		runId,
		heldBy: createdBy.email,
	});
	runs.unshift(run);
	sims.set(runId, { queue: list.slice(done + running.length), logSeq: 0 });
	return run;
};

const setWorker = (run: RunDetail, worker: WorkerState) => {
	const i = run.workers.findIndex((w) => w.name === worker.name);
	run.workers[i] = worker;
	emit(run.id, { type: "worker", worker });
};
const setFile = (run: RunDetail, file: RunFile) => {
	const i = run.files.findIndex((f) => f.file === file.file);
	if (i === -1) run.files.push(file);
	else run.files[i] = file;
	emit(run.id, { type: "file", file });
};
const setStatus = (
	run: RunDetail,
	status: RunDetail["status"],
	phase: string | null,
) => {
	run.status = status;
	run.phase = phase;
	if (TERMINAL.has(status)) run.finishedAt = iso(Date.now());
	emit(run.id, { type: "status", status, phase });
};

const tickRun = (run: RunDetail) => {
	const sim = sims.get(run.id);
	if (!sim) return;
	const ageMs = Date.now() - Date.parse(run.createdAt);

	if (run.status === "queued" && ageMs > 3_000)
		return setStatus(run, "warming", "building tw-warm image");
	if (run.status === "warming" && ageMs > 9_000)
		return setStatus(run, "provisioning", `booting 0/${run.workerCount}`);
	if (run.status === "provisioning") {
		const booting = run.workers.filter((w) => w.status === "provisioning");
		for (const w of booting.slice(0, 6))
			setWorker(run, { ...w, status: "booting" });
		const ready = run.workers.filter((w) => w.status === "booting").slice(0, 4);
		for (const w of ready) setWorker(run, { ...w, status: "ready" });
		const up = run.workers.filter((w) => w.status === "ready").length;
		if (up === run.workers.length) {
			run.startedAt = iso(Date.now());
			return setStatus(run, "running", `running 0/${run.fileCount}`);
		}
		run.phase = `booting ${up}/${run.workerCount}`;
		return emit(run.id, {
			type: "status",
			status: run.status,
			phase: run.phase,
		});
	}
	if (run.status !== "running") return;

	for (const w of run.workers) {
		const current = w.file
			? run.files.find((f) => f.file === w.file)
			: undefined;
		if (current && Math.random() < 0.1) {
			const done = finishedFile(current.file, Math.random, w.name, 0.015);
			setFile(run, done);
			if (done.status !== "passed")
				emit(run.id, {
					type: "log",
					file: done.file,
					worker: w.name,
					text: `\x1b[31m✗\x1b[0m ${done.file} — ${done.failureSummary?.split("\n")[0]}`,
				});
			else if (sim.logSeq++ % 3 === 0)
				emit(run.id, {
					type: "log",
					file: done.file,
					worker: w.name,
					text: `\x1b[32m✓\x1b[0m ${done.file} \x1b[2m${(done.durationMs ?? 0) / 1000}s\x1b[0m`,
				});
			setWorker(run, { ...w, status: "ready", file: null });
		}
		const next = w.status === "ready" ? sim.queue.shift() : undefined;
		if (next) {
			setFile(run, {
				file: next,
				status: "running",
				durationMs: null,
				attempt: 1,
				passedTests: 0,
				failedTests: 0,
				worker: w.name,
				failureSummary: null,
			});
			setWorker(run, { name: w.name, status: "busy", file: next });
		}
	}
	summarize(run);
	const finished = run.files.filter(
		(f) => f.status !== "running" && f.status !== "queued",
	).length;
	run.phase = `running ${finished}/${run.fileCount}`;
	emit(run.id, { type: "status", status: run.status, phase: run.phase });
	if (finished === run.fileCount) {
		for (const w of run.workers)
			setWorker(run, { ...w, status: "dead", file: null });
		releaseAccounts((a) => a.runId === run.id);
		setStatus(run, run.failed ? "failed" : "passed", null);
		sims.delete(run.id);
	}
};

startLiveRun({
	branch: "feat/usage-alerts",
	sha: branches[2].sha,
	selection: { groups: ["core"] },
	createdBy: ACTORS[0],
	progress: 0.42,
});
startLiveRun({
	branch: "capy/twd",
	sha: branches[9].sha,
	selection: { groups: ["billing-v2", "track"] },
	createdBy: ACTORS[3],
	workerCap: 24,
});

setInterval(() => {
	for (const run of runs.filter(isLive)) tickRun(run);
	if (!runs.some((r) => isLive(r) && r.createdBy.via.startsWith("api_key")))
		startLiveRun({
			branch: "refactor/billing-plan-v3",
			sha: branches[6].sha,
			selection: { groups: ["core-balances"] },
			createdBy: ACTORS[4],
			workerCap: 32,
		});
}, 1_000);

// ---- logs -----------------------------------------------------------------

const fileLog = (run: RunDetail, file: string) => {
	const f = run.files.find((x) => x.file === file);
	if (!f) return null;
	const r = rng(hash(run.id + file));
	const names = [
		"attaches plan",
		"prorates mid-cycle",
		"handles entity scope",
		"resets on anchor",
		"rolls over balance",
		"emits webhook",
		"respects trial end",
		"rounds zero-decimal currency",
	];
	const lines = [
		`\x1b[2m[${f.worker ?? "w000"}] bun test ${file} --timeout 120000\x1b[0m`,
		`\x1b[2mbun test v1.3.14\x1b[0m`,
		"",
		`\x1b[1m${file}:\x1b[0m`,
	];
	for (let i = 0; i < f.passedTests; i++)
		lines.push(
			`\x1b[32m✓\x1b[0m ${pick(names, r)} \x1b[2m[${Math.round(200 + r() * 9000)}ms]\x1b[0m`,
		);
	for (let i = 0; i < f.failedTests; i++) {
		lines.push(
			`\x1b[31m✗\x1b[0m ${pick(names, r)} \x1b[2m[${Math.round(2000 + r() * 30000)}ms]\x1b[0m`,
		);
		lines.push(
			"",
			`\x1b[31merror:\x1b[0m ${f.failureSummary ?? "unknown"}`,
			"",
		);
	}
	if (f.status === "running") lines.push(`\x1b[33m…\x1b[0m still running`);
	else
		lines.push(
			"",
			` \x1b[32m${f.passedTests} pass\x1b[0m`,
			` ${f.failedTests ? `\x1b[31m${f.failedTests} fail\x1b[0m` : "0 fail"}`,
			`Ran ${f.passedTests + f.failedTests} tests across 1 file. \x1b[2m[${((f.durationMs ?? 0) / 1000).toFixed(2)}s]\x1b[0m`,
		);
	return lines.join("\n");
};

// ---- api keys -------------------------------------------------------------

const apiKeys: ApiKey[] = [
	{
		id: "ak_capy01",
		name: "capy agent",
		prefix: "twd_k3f9",
		ownerEmail: ME.email,
		lastUsedAt: iso(START - 2 * MIN),
		revokedAt: null,
		createdAt: iso(START - 9 * 24 * HOUR),
	},
	{
		id: "ak_ci0042",
		name: "github actions",
		prefix: "twd_a81c",
		ownerEmail: "john@useautumn.com",
		lastUsedAt: iso(START - 40 * MIN),
		revokedAt: null,
		createdAt: iso(START - 30 * 24 * HOUR),
	},
	{
		id: "ak_laptop",
		name: "old laptop",
		prefix: "twd_09de",
		ownerEmail: ME.email,
		lastUsedAt: iso(START - 12 * 24 * HOUR),
		revokedAt: iso(START - 5 * 24 * HOUR),
		createdAt: iso(START - 60 * 24 * HOUR),
	},
];

// ---- routing --------------------------------------------------------------

const err = (
	status: number,
	code: string,
	message: string,
	next: string,
	escalate: string | null = null,
) => ({
	status,
	contentType: "application/json",
	data: { error: { code, message, next, escalate } },
});
const ok = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	data: structuredClone(data),
});
const summary = (run: RunDetail): RunSummary => {
	const { phase: _p, workers: _w, files: _f, drift: _d, ...rest } = run;
	return rest;
};

const parseTtl = (ttl: string) => {
	const m = /^(\d+)(m|h)$/.exec(ttl);
	if (!m) return null;
	const ms = Number(m[1]) * (m[2] === "h" ? HOUR : MIN);
	return ms > 24 * HOUR ? null : ms;
};

const capacity = (): Capacity => {
	const counts = countStates(accounts);
	return {
		gate: gate.state,
		usableKeys: keys.filter((k) => k.usable).length,
		accounts: counts,
		liveRuns: runs.filter(isLive).length,
		maxFilesNow: gate.state === "draining" ? 0 : counts.clean,
		warmBuilds: branches.filter((b) => b.warm === "building").length,
	};
};

const signedOut = () => localStorage.getItem("twd-mock-signed-out") === "1";

export const handle = ({
	method,
	path,
	body,
}: {
	method: Method;
	path: string;
	body?: unknown;
}) => {
	const url = new URL(path, "http://mock");
	const p = url.pathname;
	const route = `${method} ${p}`;
	const seg = p.split("/").filter(Boolean);

	if (route === "POST /auth/logout") {
		localStorage.setItem("twd-mock-signed-out", "1");
		return ok({ ok: true });
	}
	if (signedOut())
		return err(
			401,
			"unauthenticated",
			"You are not signed in.",
			"Sign in with your @useautumn.com Google account, or send Authorization: Bearer twd_….",
		);

	if (route === "GET /me") return ok(ME);
	if (route === "GET /catalog") return ok(catalog);
	if (route === "GET /branches") return ok(branches);
	if (route === "GET /capacity") return ok(capacity());
	if (route === "GET /keys") return ok(keysOverview());
	if (route === "GET /accounts") return ok(accounts);
	if (route === "GET /reservations") return ok(reservations);
	if (route === "GET /api-keys") return ok(apiKeys);

	if (method === "POST" && seg[0] === "branches" && seg[2] === "warm") {
		const b = branches.find((x) => x.name === decodeURIComponent(seg[1]));
		if (!b)
			return err(
				404,
				"branch_not_found",
				`Branch ${seg[1]} is not on GitHub.`,
				"Push the branch to origin, then warm it again.",
				"Only you can push this branch.",
			);
		b.warm = "building";
		const res = enqueue("warm", `warm:${b.sha}`);
		setTimeout(() => {
			b.warm = "ready";
			res.job.status = "succeeded";
			res.job.finishedAt = iso(Date.now());
		}, 8_000);
		return ok(res);
	}

	if (route === "GET /runs") {
		const status = url.searchParams.get("status") ?? "live";
		const branch = url.searchParams.get("branch");
		const list = runs
			.filter((r) =>
				status === "all" ? true : status === "live" ? isLive(r) : !isLive(r),
			)
			.filter((r) => !branch || r.branch.includes(branch))
			.slice(0, Number(url.searchParams.get("limit") ?? 50));
		return ok(list.map(summary));
	}

	if (route === "POST /runs") {
		const b = body as {
			branch: string;
			sha?: string;
			selection: RunSummary["selection"];
			purpose?: RunSummary["purpose"];
		};
		const branch = branches.find((x) => x.name === b.branch);
		if (!branch)
			return err(
				404,
				"branch_not_pushed",
				`Branch "${b.branch}" was not found on origin.`,
				"Push it (git push -u origin HEAD) and retry; twd warms it automatically.",
				"Only the branch owner can push it.",
			);
		if (gate.state === "draining")
			return err(
				409,
				"keys_draining",
				"Stripe keys are being re-initialised; new runs are paused.",
				"Retry in a few minutes, or watch GET /keys until gate is open.",
				"If the gate stays draining for more than 15 minutes, ask a twd admin to check the reinit_keys job.",
			);
		const count = filesForSelection(b.selection).length;
		if (!count)
			return err(
				422,
				"empty_selection",
				"The selection matched no test files.",
				"Pick at least one group or file, or loosen the grep.",
			);
		const cap = capacity();
		if (count > cap.maxFilesNow && cap.maxFilesNow < 40)
			return err(
				409,
				"no_capacity",
				`Only ${cap.maxFilesNow} clean accounts are free.`,
				"Wait for nukes to finish or release a reservation.",
				"If accounts stay broken, ask a twd admin to re-initialise keys.",
			);
		const run = startLiveRun({
			branch: branch.name,
			sha: b.sha ?? branch.sha,
			selection: b.selection,
			createdBy: { userId: ME.userId, email: ME.email, via: ME.via },
			purpose: b.purpose,
		});
		return ok(summary(run));
	}

	if (seg[0] === "runs" && seg[1]) {
		const run = runs.find((r) => r.id === seg[1]);
		if (!run)
			return err(
				404,
				"run_not_found",
				`No run ${seg[1]}.`,
				"List runs with GET /runs?status=all.",
			);
		if (method === "GET" && seg.length === 2) return ok(run);
		if (method === "GET" && seg[2] === "files" && seg[3] === "log") {
			const log = fileLog(run, url.searchParams.get("file") ?? "");
			if (log === null)
				return err(
					404,
					"file_not_in_run",
					"That file is not part of this run.",
					"Pick a file from GET /runs/:id.",
				);
			return { status: 200, contentType: "text/plain", data: log };
		}
		if (method === "POST" && seg[2] === "cancel") {
			if (!isLive(run))
				return err(
					409,
					"run_finished",
					"This run already finished.",
					"Nothing to cancel; start a new run if needed.",
				);
			for (const w of run.workers)
				setWorker(run, { ...w, status: "dead", file: null });
			run.files = run.files.filter((f) => f.status !== "running");
			releaseAccounts((a) => a.runId === run.id);
			sims.delete(run.id);
			setStatus(run, "cancelled", null);
			return ok(summary(run));
		}
		if (method === "POST" && seg[2] === "rerun-failed") {
			const failed = run.files
				.filter((f) => f.status === "failed" || f.status === "crashed")
				.map((f) => f.file);
			if (!failed.length)
				return err(
					422,
					"nothing_failed",
					"No failed files to rerun.",
					"Start a fresh run from New run instead.",
				);
			const next = startLiveRun({
				branch: run.branch,
				sha: run.sha,
				selection: { files: failed },
				createdBy: { userId: ME.userId, email: ME.email, via: ME.via },
			});
			return ok(summary(next));
		}
	}

	if (route === "POST /keys/probe") {
		for (const k of keys) k.probedAt = iso(Date.now());
		return ok(keysOverview());
	}
	if (route === "POST /keys/reinit") {
		const res = enqueue("reinit_keys", "reinit_keys");
		gate = {
			state: "draining",
			reason:
				"Re-initialising keys: waiting for live swarms and nukes, then re-registering webhooks",
			jobId: res.job.id,
		};
		setTimeout(() => {
			gate = { state: "open", reason: null, jobId: null };
			res.job.status = "succeeded";
			res.job.finishedAt = iso(Date.now());
			for (const k of keys) if (k.usable) k.webhookRegistered = true;
		}, 25_000);
		return ok(res);
	}

	if (route === "POST /reservations") {
		const b = body as { count: number; ttl?: string; note?: string };
		const ttlMs = parseTtl(b.ttl ?? "2h");
		if (!ttlMs)
			return err(
				422,
				"bad_ttl",
				`TTL "${b.ttl}" is not valid.`,
				'Use a duration like "30m" or "2h" (max 24h).',
			);
		if (b.count > capacity().accounts.clean)
			return err(
				409,
				"no_capacity",
				`Only ${capacity().accounts.clean} clean accounts are free.`,
				"Reserve fewer accounts or wait for nukes to finish.",
				"If the clean pool stays this small, ask a twd admin to re-initialise keys or add platform keys to TW_V3_KEYS.",
			);
		return ok(
			createReservation({
				owner: { userId: ME.userId, email: ME.email, via: ME.via },
				count: b.count,
				ttlMs,
				note: b.note ?? null,
			}),
		);
	}
	if (method === "DELETE" && seg[0] === "reservations") {
		const r = reservations.find((x) => x.id === seg[1]);
		if (!r)
			return err(
				404,
				"reservation_not_found",
				"No such reservation.",
				"List reservations with GET /reservations.",
			);
		r.releasedAt = iso(Date.now());
		releaseAccounts((a) => a.reservationId === r.id);
		return ok(r);
	}

	if (route === "POST /api-keys") {
		const name = (body as { name: string }).name;
		const key: ApiKey = {
			id: id("ak"),
			name,
			prefix: `twd_${hex(4)}`,
			ownerEmail: ME.email,
			lastUsedAt: null,
			revokedAt: null,
			createdAt: iso(Date.now()),
		};
		apiKeys.unshift(key);
		return ok({ apiKey: key, secret: `${key.prefix}${hex(36)}` });
	}
	if (method === "DELETE" && seg[0] === "api-keys") {
		const k = apiKeys.find((x) => x.id === seg[1]);
		if (!k)
			return err(
				404,
				"api_key_not_found",
				"No such API key.",
				"Refresh the list.",
			);
		k.revokedAt = iso(Date.now());
		return ok(k);
	}

	return err(
		404,
		"not_found",
		`${route} is not a twd route.`,
		"Check src/api/contract.ts ROUTES.",
	);
};

// ---- live (WebSocket /ws) -------------------------------------------------

type LiveConn = {
	topics: Set<string>;
	emit: (topic: string, e: LiveEvent) => void;
};
const conns = new Set<LiveConn>();

const publish = (topic: string, event: LiveEvent) => {
	for (const c of conns) c.emit(topic, event);
};

const snapshotOf = (topic: string) => {
	if (topic === "runs") return runs.map(summary);
	if (topic === "jobs") return jobs;
	if (topic === "capacity") return capacity();
	if (topic.startsWith("run:"))
		return runs.find((r) => r.id === topic.slice(4)) ?? null;
	return null;
};

/** Diffs server state once a tick and publishes what moved, like the real hub. */
const seen = new Map<string, string>();
let primed = false;
const changed = (key: string, value: unknown) => {
	const next = JSON.stringify(value);
	const prev = seen.get(key);
	seen.set(key, next);
	return primed && prev !== next;
};
export const flush = () => {
	for (const run of runs)
		if (changed(`run:${run.id}`, summary(run)))
			publish("runs", { type: "run.updated", run: summary(run) });
	for (const job of jobs)
		if (changed(`job:${job.id}`, job))
			publish("jobs", { type: "job.updated", job });
	const cap = capacity();
	if (changed("capacity", cap))
		publish("capacity", { type: "capacity.updated", capacity: cap });
	if (changed("keys", keysOverview()))
		publish("keys", { type: "keys.changed" });
	if (changed("accounts", [accounts, reservations]))
		publish("accounts", { type: "accounts.changed" });
	for (const b of branches)
		if (changed(`warm:${b.name}`, b.warm) && b.warm !== "none")
			publish("warm", {
				type: "warm.updated",
				sha: b.sha,
				branch: b.name,
				status: b.warm,
			});
};
flush();
primed = true;
setInterval(flush, 1_000);

/** One fake socket: same LiveClientMessage in, same LiveServerMessage out. */
export const connectLive = (send: (msg: LiveServerMessage) => void) => {
	let seq = 0;
	const conn: LiveConn = {
		topics: new Set(),
		emit: (topic, event) => {
			if (conn.topics.has(topic))
				send({ type: "event", topic, seq: ++seq, event });
		},
	};
	conns.add(conn);
	send({
		type: "hello",
		connectionId: id("conn"),
		actor: { userId: ME.userId, email: ME.email, via: ME.via },
	});
	return {
		receive: (msg: LiveClientMessage) => {
			if (msg.type === "ping") return send({ type: "pong" });
			for (const topic of msg.topics) {
				if (msg.type === "unsubscribe") {
					conn.topics.delete(topic);
					continue;
				}
				conn.topics.add(topic);
				send({
					type: "snapshot",
					topic,
					data: structuredClone(snapshotOf(topic)),
				} as LiveServerMessage);
			}
		},
		close: () => {
			conns.delete(conn);
		},
	};
};
