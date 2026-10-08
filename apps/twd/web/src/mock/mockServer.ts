import type {
	ApiKey,
	Branch,
	Capacity,
	Catalog,
	Costs,
	Drift,
	EnqueueResponse,
	Job,
	KeysOverview,
	LiveClientMessage,
	LiveEvent,
	LiveServerMessage,
	Me,
	RunDetail,
	RunEvent,
	RunFile,
	RunLive,
	RunSummary,
	StripeAccount,
	StripeKey,
	WorkerState,
} from "../../../src/api/contract.ts";
import {
	BRANCH_HISTORY_RUNS,
	CreateRunBody,
	isFailedFileStatus,
} from "../../../src/api/contract.ts";
import { TwdError } from "../../../src/http/apiError.ts";
import {
	createDurationModel,
	type EtaPriors,
	estimateRunEta,
} from "../../../src/internal/runs/eta/estimateRunEta.ts";
import {
	planWorkItems,
	splitRepetitionId,
	summariseRepeats,
} from "../../../src/internal/runs/repeat/repetitions.ts";
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
	{ userId: "usr_shreyas", email: "shreyas@useautumn.com", via: "session" },
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
const MOCK_ETA_PRIORS: EtaPriors = {
	model: createDurationModel({
		baselines: new Map(
			catalog.files.flatMap((f) =>
				f.baselineP90Ms === null
					? []
					: [
							[
								f.path,
								{
									p50Ms: Math.round(f.baselineP90Ms * 0.7),
									p90Ms: f.baselineP90Ms,
									passRate: 0.985,
								},
							] as const,
						],
			),
		),
	}),
	bootP50Ms: 25_000,
	teardownP50Ms: 60_000,
};
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

const UNUSABLE: Partial<Record<number, string>> = {
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

const BROKEN_REASONS = [
	"nuke: Stripe 429 rate_limit after 5 retries deleting customers",
	"verify: 3 subscriptions still active after nuke (sub_1Q…)",
	"nuke: No such account: 'acct_1Q…' (deleted in Stripe?)",
	"verify: test clock still advancing; delete timed out after 60s",
	"nuke: webhook endpoint delete returned 500 from Stripe",
];

const accounts: StripeAccount[] = keys.flatMap((k, ki) =>
	k.usable
		? Array.from({ length: 3 }, (_, j) => {
				const broken = ki % 97 === 5 && j === 2;
				return {
					id: `acc_${String(ki * 3 + j).padStart(5, "0")}`,
					platformAccountId: k.platformAccountId,
					state: broken ? ("broken" as const) : ("clean" as const),
					heldBy: null,
					runId: null,
					stateChangedAt: iso(START - rand() * 6 * HOUR),
					brokenReason: broken
						? BROKEN_REASONS[Math.floor(ki / 97) % BROKEN_REASONS.length]
						: null,
				};
			})
		: [],
);

const claim = ({
	count,
	runId,
	heldBy,
}: {
	count: number;
	runId: string;
	heldBy: string;
}) => {
	const slot = (a: StripeAccount) => Number(a.id.slice(4)) % 3;
	const free = accounts
		.filter((a) => a.state === "clean")
		.sort((a, b) => slot(a) - slot(b) || a.id.localeCompare(b.id))
		.slice(0, count);
	for (const a of free) {
		a.state = "in_use";
		a.runId = runId;
		a.heldBy = heldBy;
		a.stateChangedAt = iso(Date.now());
	}
	return free.map((a) => a.id);
};

const releaseAccounts = (match: (a: StripeAccount) => boolean) => {
	for (const a of accounts.filter(match)) {
		a.state = "nuking";
		a.brokenReason = null;
		a.runId = null;
		a.heldBy = null;
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

const FULL_NUKE_REASON = "full nuke in progress";
const FULL_NUKE_MS = 20_000;

/** Simulated full nuke: ~20s to delete, re-register the webhook, then top up. */
const fullNukeKey = ({
	key,
	targetPerKey,
}: {
	key: (typeof keys)[number];
	targetPerKey: number;
}) => {
	const res = enqueue(
		"full_nuke_key",
		`full_nuke_key:${key.platformAccountId}`,
	);
	if (res.deduped) return res;
	key.usable = false;
	key.unusableReason = FULL_NUKE_REASON;
	const owned = accounts.filter(
		(a) =>
			a.platformAccountId === key.platformAccountId && a.state !== "in_use",
	);
	for (const a of owned) {
		a.state = "nuking";
		a.brokenReason = null;
		a.stateChangedAt = iso(Date.now());
	}
	setTimeout(() => {
		key.webhookRegistered = false;
		for (const a of owned) accounts.splice(accounts.indexOf(a), 1);
	}, FULL_NUKE_MS * 0.6);
	setTimeout(() => {
		const ki = keys.indexOf(key);
		for (let j = 0; j < targetPerKey; j++)
			accounts.push({
				id: `acc_${ki}_${hex(6)}`,
				platformAccountId: key.platformAccountId,
				state: "clean",
				heldBy: null,
				runId: null,
				stateChangedAt: iso(Date.now()),
				brokenReason: null,
			});
		key.usable = true;
		key.unusableReason = null;
		key.webhookRegistered = true;
		key.probedAt = iso(Date.now());
		res.job.status = "succeeded";
		res.job.finishedAt = iso(Date.now());
	}, FULL_NUKE_MS);
	return res;
};

// ---- runs -----------------------------------------------------------------

type Sim = {
	queue: string[];
	logSeq: number;
	ticks: number;
	/** When the run left the account queue; phases time from here. */
	readyAt: number;
	workerSeconds: number;
	peakWorkers: number;
	warmForMs: number;
	/** When each running file landed on its worker. */
	fileStartedAt: Map<string, number>;
};
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
	const base = p90.get(splitRepetitionId({ id: file }).file) ?? 30_000;
	const failed = r() < failRate;
	const slow = r() < 0.02;
	const tests = 2 + Math.floor(r() * 14);
	const failedTests = failed ? 1 + Math.floor(r() * 2) : 0;
	const kind = failed ? r() : 1;
	const status: RunFile["status"] = !failed
		? "passed"
		: kind < 0.15
			? "crashed"
			: kind < 0.35
				? "timed_out"
				: "failed";
	const durationMs = Math.round(base * (slow ? 1.7 + r() : 0.55 + r() * 0.5));
	const attempt = failed && r() < 0.5 ? 2 : 1;
	return {
		file,
		status,
		durationMs:
			status === "timed_out" ? 300_000 + (durationMs % 4_000) : durationMs,
		attempt,
		passedTests: tests - failedTests,
		failedTests,
		worker,
		failureSummary:
			status === "timed_out"
				? `timed out after 300000ms (attempt ${attempt})\n✗ ${file.split("/").pop()} > settles every plan`
				: failed
					? pick(FAILURES, r)
					: null,
	};
};

const computeDrift = (files: RunFile[]): Drift[] =>
	files.flatMap((f): Drift[] => {
		const base = p90.get(f.file);
		const r = rng(hash(f.file));
		if (isFailedFileStatus(f.status) && r() < 0.7)
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
	run.failed = run.files.filter((f) => isFailedFileStatus(f.status)).length;
	run.drift = run.repeat > 1 ? [] : computeDrift(run.files);
	run.repeats = run.repeat > 1 ? summariseRepeats({ files: run.files }) : [];
};

const summary = (run: RunDetail): RunSummary => {
	const {
		phase: _p,
		workers: _w,
		files: _f,
		drift: _d,
		repeats: _r,
		etaMs: _eta,
		etaP90Ms: _etaP90,
		...rest
	} = run;
	if (!isLive(run)) return { ...rest, live: null };
	const workers: RunLive["workers"] = {};
	for (const w of run.workers) workers[w.status] = (workers[w.status] ?? 0) + 1;
	const unspawned = Math.max(0, (run.workersWanted ?? 0) - run.workers.length);
	return {
		...rest,
		live: {
			workers,
			etaMs: run.etaMs,
			accountsPending: run.status === "warming" ? 0 : unspawned,
		},
	};
};

// ---- costs ----------------------------------------------------------------

/** Same defaults as internal/costs/actions/getCostRates.ts. */
const RATES: Costs["rates"] = {
	usdPerCoreSecond: 0.00003942,
	usdPerGibSecond: 0.00000667,
	regionMultiplier: 1,
	workerCores: 2,
	workerMemoryGib: 4,
};
const WORKER_USD_S =
	(RATES.workerCores * RATES.usdPerCoreSecond +
		RATES.workerMemoryGib * RATES.usdPerGibSecond) *
	RATES.regionMultiplier;
const BOOT_S = 90;
const costOf = (workerSeconds: number, final: boolean) => ({
	usd: Math.round(workerSeconds * WORKER_USD_S * 10_000) / 10_000,
	workerSeconds: Math.round(workerSeconds),
	final,
});

// ---- history (60 days of finished runs) -----------------------------------

const HISTORY_DAYS = 60;
const DAY = 24 * HOUR;
const RUN_USERS = [ACTORS[0], ACTORS[1], ACTORS[2], ACTORS[5], ACTORS[3]];
/** Relative run volume per actor above; the api-key actor is Tanvir's agent. */
const USER_WEIGHT = [0.3, 0.22, 0.14, 0.12, 0.22];

const SELECTIONS = [
	{ groups: ["core"] },
	{ groups: ["core-attach", "core-balances"] },
	{ groups: ["billing"] },
	{ groups: ["pre-merge"] },
	{ files: filesForSelection({ groups: ["track"] }).slice(0, 12) },
	{ groups: ["webhooks"], grep: "webhook" },
];

/** Busy weekdays, quiet weekends, a slow ramp up towards today. */
const historyTimes = (() => {
	const r = rng(99);
	const times: { at: number; baseline: boolean }[] = [];
	for (let d = 0; d < HISTORY_DAYS; d++) {
		const dayStart = Math.floor((START - d * DAY) / DAY) * DAY;
		const weekend = [0, 6].includes(new Date(dayStart).getUTCDay());
		const volume = weekend ? 2 + r() * 3 : 7 + (1 - d / HISTORY_DAYS) * 6;
		const count = Math.round(volume * (0.7 + r() * 0.6));
		times.push({ at: dayStart + 2 * HOUR, baseline: true });
		for (let k = 0; k < count; k++)
			times.push({ at: dayStart + (8 + r() * 14) * HOUR, baseline: false });
	}
	return times
		.filter((t) => t.at < START - 30 * MIN)
		.sort((a, b) => b.at - a.at);
})();

const pickUser = (r: () => number) => {
	let x = r();
	for (const [i, w] of USER_WEIGHT.entries()) {
		x -= w;
		if (x <= 0) return RUN_USERS[i];
	}
	return RUN_USERS[0];
};

const makeFinishedRun = (i: number): RunDetail => {
	const r = rng(500 + i);
	const { at: createdAt, baseline } = historyTimes[i];
	const branch = baseline
		? branches[0]
		: i % 4 === 0
			? branches[0]
			: pick(branches.slice(2), r);
	const manualBaseline = !baseline && branch.name === "dev" && i % 9 === 4;
	const selection =
		baseline || manualBaseline
			? { groups: ["core", ...fixture.suites[1].groups] }
			: pick(SELECTIONS, r);
	const list = filesForSelection(selection);
	const workerCount = Math.min(list.length, 40 + Math.floor(r() * 160));
	const failRate = r() < 0.45 ? 0 : 0.004 + r() * 0.02;
	const startedAt = createdAt + (40 + r() * 80) * 1000;
	const files = list.map((f, j) =>
		finishedFile(f, r, workerName(j % workerCount), failRate),
	);
	const wall = Math.max(0, ...files.map((f) => f.durationMs ?? 0)) + 90_000;
	const cancelled = i === 6;
	const kept = cancelled ? files.slice(0, Math.floor(files.length / 3)) : files;
	const workers = Array.from({ length: workerCount }, (_, w) => {
		const boot = mockBoot();
		return {
			name: workerName(w),
			status: "dead" as const,
			file: null,
			boot,
			readyAt: iso(startedAt + boot.totalMs),
		};
	});
	const workerFree = new Map(
		workers.map((w) => [w.name, Date.parse(w.readyAt)]),
	);
	const workerSeconds =
		kept.reduce((sum, f) => sum + (f.durationMs ?? 0), 0) / 1000 +
		BOOT_S * workerCount;
	const run: RunDetail = {
		id: `run_${hex(10, r)}`,
		branch: branch.name,
		sha: hex(40, r),
		pinnedSha: !baseline && i % 5 === 3,
		status: cancelled ? "cancelled" : "passed",
		purpose: baseline ? "baseline" : "adhoc",
		baseline: baseline || manualBaseline,
		selection,
		repeat: 1,
		fileCount: list.length,
		workerCount,
		workersWanted: workerCount,
		queuePosition: null,
		cost: costOf(workerSeconds, true),
		passed: 0,
		failed: 0,
		newFailures: null,
		live: null,
		createdBy: baseline ? SYSTEM : pickUser(r),
		createdAt: iso(createdAt),
		startedAt: iso(startedAt),
		finishedAt: iso(startedAt + (cancelled ? wall / 3 : wall)),
		phase: null,
		workers,
		files: kept.map((f) => {
			const cursor =
				(workerFree.get(f.worker ?? "") ?? startedAt) + (f.durationMs ?? 0);
			workerFree.set(f.worker ?? "", cursor);
			return { ...f, finishedAt: iso(cursor) };
		}),
		repeats: [],
		drift: [],
		milestones: {
			warmReadyAt: iso(createdAt + (startedAt - createdAt) * 0.6),
			accountsAt: iso(startedAt),
		},
		etaMs: null,
		etaP90Ms: null,
	};
	summarize(run);
	if (!cancelled && run.failed > 0) run.status = "failed";
	if (!cancelled)
		run.newFailures = run.drift.filter((d) => d.kind === "new_failure").length;
	return run;
};

/** Finished runs keep only their summary; details regenerate from the seed. */
const history = historyTimes.map((_, i) => summary(makeFinishedRun(i)));
const historyIndex = new Map(history.map((h, i) => [h.id, i]));
const details = new Map<string, RunDetail>();

const findRun = (runId: string) => {
	const session = runs.find((r) => r.id === runId);
	if (session) return session;
	const i = historyIndex.get(runId);
	if (i === undefined) return undefined;
	const cached = details.get(runId) ?? makeFinishedRun(i);
	details.set(runId, cached);
	return cached;
};
const allSummaries = () => [...runs.map(summary), ...history];

const warmBuilds = (() => {
	const r = rng(4242);
	return historyTimes
		.filter(() => r() < 0.55)
		.map((t) => ({
			at: t.at - 20 * MIN,
			usd: (240 + r() * 360) * WORKER_USD_S * 4,
		}));
})();

const bucketStart = (ms: number, bucket: "day" | "week") => {
	const day = Math.floor(ms / DAY) * DAY;
	if (bucket === "day") return day;
	return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
};

const costsReport = ({
	from,
	to,
	bucket,
}: {
	from: number;
	to: number;
	bucket: "day" | "week";
}): Costs => {
	const inRange = allSummaries().filter((r) => {
		const at = Date.parse(r.createdAt);
		return at >= from && at <= to && r.cost.usd > 0;
	});
	const warm = warmBuilds.filter((w) => w.at >= from && w.at <= to);
	const buckets = new Map<number, Costs["buckets"][number]>();
	for (
		let t = bucketStart(from, bucket);
		t <= to;
		t += bucket === "day" ? DAY : 7 * DAY
	)
		buckets.set(t, {
			start: iso(t),
			usd: 0,
			warmUsd: 0,
			runs: 0,
			byUser: {},
		});
	const users = new Map<string, Costs["users"][number]>();
	for (const run of inRange) {
		const b = buckets.get(bucketStart(Date.parse(run.createdAt), bucket));
		const { userId, email } = run.createdBy;
		const u = users.get(userId) ?? { userId, email, usd: 0, runs: 0 };
		u.usd += run.cost.usd;
		u.runs += 1;
		users.set(userId, u);
		if (!b) continue;
		b.usd += run.cost.usd;
		b.runs += 1;
		b.byUser[userId] = (b.byUser[userId] ?? 0) + run.cost.usd;
	}
	for (const w of warm) {
		const b = buckets.get(bucketStart(w.at, bucket));
		if (!b) continue;
		b.usd += w.usd;
		b.warmUsd += w.usd;
	}
	const warmUsd = warm.reduce((s, w) => s + w.usd, 0);
	return {
		rates: RATES,
		totals: {
			usd: inRange.reduce((s, r) => s + r.cost.usd, 0) + warmUsd,
			runs: inRange.length,
			workerSeconds: inRange.reduce((s, r) => s + r.cost.workerSeconds, 0),
			warmUsd,
		},
		buckets: [...buckets.values()],
		users: [...users.values()].sort((a, b) => b.usd - a.usd),
		topRuns: [...inRange].sort((a, b) => b.cost.usd - a.cost.usd).slice(0, 10),
	};
};

// ---- live runs ------------------------------------------------------------

const startLiveRun = ({
	branch,
	sha,
	selection,
	createdBy,
	progress = 0,
	workerCap = 40,
	startWorkers = 12,
	queuedForMs = 0,
	purpose = "adhoc",
	pinnedSha = false,
	repeat = 1,
	warmForMs = 6_000,
}: {
	branch: string;
	sha: string;
	pinnedSha?: boolean;
	selection: RunSummary["selection"];
	createdBy: RunSummary["createdBy"];
	progress?: number;
	workerCap?: number;
	/** Workers attached at start; the rest arrive as accounts free up. */
	startWorkers?: number;
	/** Wait in the FIFO account queue before anything starts. */
	queuedForMs?: number;
	purpose?: RunSummary["purpose"];
	repeat?: number;
	/** How long the run sits in "warming" before workers boot. */
	warmForMs?: number;
}) => {
	const list = planWorkItems({ files: filesForSelection(selection), repeat });
	const wanted = Math.min(list.length, workerCap);
	const attached = queuedForMs ? 0 : Math.min(wanted, startWorkers);
	const runId = `run_${hex(10)}`;
	const now = Date.now();
	const createdAt = now - progress * 11 * MIN;
	const startedAt = createdAt + 70_000;
	const done = Math.floor(list.length * progress);
	const boots = Array.from({ length: attached }, () => mockBoot());
	const readyAt = boots.map((b) => startedAt + (b.totalMs ?? 0));
	const finished = list
		.slice(0, done)
		.map((f, j) => finishedFile(f, rand, workerName(j % attached), 0.012));
	// Lay finished files end to end per worker, squeezed to end before now.
	const cursor = [...readyAt];
	const ends = finished.map((f, j) => {
		cursor[j % attached] += f.durationMs ?? 0;
		return cursor[j % attached];
	});
	const last = Math.max(startedAt + 1, ...ends);
	const squeeze = Math.min(1, (now - 10_000 - startedAt) / (last - startedAt));
	const at = (ms: number) => startedAt + (ms - startedAt) * squeeze;
	const files: RunFile[] = finished.map((f, j) => ({
		...f,
		finishedAt: iso(at(ends[j])),
	}));
	const running = progress > 0 ? list.slice(done, done + attached) : [];
	const queuePosition = queuedForMs
		? runs.filter((r) => r.queuePosition !== null).length + 1
		: null;
	const run: RunDetail = {
		id: runId,
		branch,
		sha,
		pinnedSha,
		status: progress > 0 ? "running" : "queued",
		purpose,
		baseline: purpose === "baseline" && branch === "dev",
		selection,
		repeat,
		fileCount: list.length,
		workerCount: attached,
		workersWanted: wanted,
		queuePosition,
		cost: costOf(progress > 0 ? attached * (progress * 11 * 60) : 0, false),
		passed: 0,
		failed: 0,
		newFailures: null,
		live: null,
		createdBy,
		createdAt: iso(createdAt),
		startedAt: progress > 0 ? iso(startedAt) : null,
		finishedAt: null,
		phase:
			progress > 0
				? `running ${done}/${list.length}`
				: queuePosition
					? `waiting for accounts · #${queuePosition} in queue`
					: "waiting for warm image",
		workers: Array.from({ length: attached }, (_, w) => ({
			name: workerName(w),
			status: running[w]
				? ("busy" as const)
				: progress > 0
					? ("ready" as const)
					: ("provisioning" as const),
			file: running[w] ?? null,
			...(progress > 0 && {
				boot: boots[w],
				readyAt: iso(at(readyAt[w])),
			}),
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
			...list.slice(done + running.length).map((file) => ({
				file,
				status: "queued" as const,
				durationMs: null,
				attempt: 0,
				passedTests: 0,
				failedTests: 0,
				worker: null,
				failureSummary: null,
			})),
		],
		repeats: [],
		drift: [],
		milestones:
			progress > 0
				? { warmReadyAt: iso(createdAt + 45_000), accountsAt: iso(startedAt) }
				: null,
		etaMs: null,
		etaP90Ms: null,
	};
	summarize(run);
	claim({ count: attached, runId, heldBy: createdBy.email });
	runs.unshift(run);
	sims.set(runId, {
		queue: list.slice(done + running.length),
		logSeq: 0,
		ticks: 0,
		readyAt: createdAt + queuedForMs,
		workerSeconds: run.cost.workerSeconds,
		peakWorkers: run.workerCount ?? 0,
		warmForMs,
		fileStartedAt: new Map(
			running.map((file, w) => [file, Math.min(now - 1_000, at(cursor[w]))]),
		),
	});
	return run;
};

const setWorker = (run: RunDetail, worker: WorkerState) => {
	const i = run.workers.findIndex((w) => w.name === worker.name);
	if (i === -1) run.workers.push(worker);
	else run.workers[i] = worker;
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
	if (TERMINAL.has(status)) {
		run.etaMs = null;
		run.etaP90Ms = null;
		run.finishedAt = iso(Date.now());
		run.cost = { ...run.cost, final: true };
	}
	emit(run.id, { type: "status", status, phase });
};

/** Elastic growth: a few more workers every other tick while accounts are free. */
const growWorkers = (run: RunDetail, sim: Sim) => {
	const missing = (run.workersWanted ?? 0) - run.workers.length;
	if (missing <= 0 || sim.ticks % 2) return;
	const got = claim({
		count: Math.min(missing, 3),
		runId: run.id,
		heldBy: run.createdBy.email,
	});
	for (const _ of got)
		setWorker(run, {
			name: workerName(run.workers.length),
			status: "provisioning",
			file: null,
		});
};

function mockBoot() {
	const j = (base: number, spread: number) =>
		Math.round(base + Math.random() * spread);
	const steps = [
		{ step: "modal create", ms: j(900, 4_000) },
		{ step: "tunnel url", ms: j(150, 600) },
		{ step: "exec → boot.ts", ms: j(3_000, 3_000) },
		{ step: "services up", ms: j(1_000, 2_500) },
		{ step: "balance queue prep", ms: j(100, 300) },
		{ step: "bun install", ms: j(900, 1_500) },
		{ step: "db migrate", ms: j(700, 800) },
		{ step: "stripe bind", ms: j(100, 300) },
		{ step: "server load → health", ms: j(6_000, 6_000) },
		{ step: "ready seen by twd", ms: j(50, 900) },
		{ step: "ingress mapping", ms: j(80, 400) },
	];
	return { steps, totalMs: steps.reduce((sum, s) => sum + s.ms, 0) };
}

const bootWorkers = (run: RunDetail) => {
	const ready = run.workers.filter((w) => w.status === "booting").slice(0, 4);
	for (const w of ready)
		setWorker(run, {
			...w,
			status: "ready",
			boot: mockBoot(),
			readyAt: iso(Date.now()),
		});
	const waiting = run.workers.filter((w) => w.status === "provisioning");
	for (const w of waiting.slice(0, 6))
		setWorker(run, { ...w, status: "booting" });
};

/** The same estimator twd runs server-side, fed the mock catalog's baselines. */
const updateEta = (run: RunDetail, sim: Sim) => {
	const eta = estimateRunEta({
		now: Date.now(),
		files: run.files.map((f) => ({
			file: f.file,
			status: f.status,
			durationMs: f.durationMs,
			finishedAt: f.finishedAt ? Date.parse(f.finishedAt) : null,
			startedAt: sim.fileStartedAt.get(f.file) ?? null,
			worker: f.worker,
			attempt: f.attempt,
		})),
		workers: run.workers,
		moreWorkersWanted: Math.max(
			0,
			(run.workersWanted ?? 0) - run.workers.length,
		),
		priors: MOCK_ETA_PRIORS,
	});
	run.etaMs = eta?.etaMs ?? null;
	run.etaP90Ms = eta?.etaP90Ms ?? null;
	emit(run.id, { type: "eta", etaMs: run.etaMs, etaP90Ms: run.etaP90Ms });
};

const tickRun = (run: RunDetail) => {
	const sim = sims.get(run.id);
	if (!sim) return;
	sim.ticks++;
	if (run.queuePosition !== null) {
		if (Date.now() < sim.readyAt) return;
		run.queuePosition = null;
		const got = claim({
			count: Math.min(run.workersWanted ?? 0, 12),
			runId: run.id,
			heldBy: run.createdBy.email,
		});
		for (const _ of got)
			setWorker(run, {
				name: workerName(run.workers.length),
				status: "provisioning",
				file: null,
			});
		return setStatus(run, "queued", "waiting for warm image");
	}
	const alive = run.workers.filter((w) => w.status !== "dead").length;
	run.workerCount = alive;
	sim.peakWorkers = Math.max(sim.peakWorkers, alive);
	sim.workerSeconds += alive;
	run.cost = costOf(sim.workerSeconds, false);
	const ageMs = Date.now() - sim.readyAt;

	if (run.status === "queued" && ageMs > 3_000)
		return setStatus(run, "warming", "building tw-warm image");
	if (run.status === "warming" && ageMs > 3_000 + sim.warmForMs) {
		run.milestones = {
			warmReadyAt: iso(Date.now()),
			accountsAt: iso(Date.now()),
		};
		run.status = "provisioning";
		run.phase = `booting 0/${run.workers.length}`;
		return emit(run.id, {
			type: "status",
			status: run.status,
			phase: run.phase,
			milestones: run.milestones,
		});
	}
	if (run.status === "provisioning") {
		bootWorkers(run);
		const up = run.workers.filter((w) => w.status === "ready").length;
		if (up > 0 && up >= run.workers.length / 2) {
			run.startedAt = iso(Date.now());
			return setStatus(run, "running", `running 0/${run.fileCount}`);
		}
		run.phase = `booting ${up}/${run.workers.length}`;
		return emit(run.id, {
			type: "status",
			status: run.status,
			phase: run.phase,
		});
	}
	if (run.status !== "running") return;

	growWorkers(run, sim);
	bootWorkers(run);
	for (const w of run.workers) {
		const current = w.file
			? run.files.find((f) => f.file === w.file)
			: undefined;
		if (current && Math.random() < 0.1) {
			const done = {
				...finishedFile(current.file, Math.random, w.name, 0.015),
				finishedAt: iso(Date.now()),
			};
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
			sim.fileStartedAt.set(next, Date.now());
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
			setWorker(run, { ...w, status: "busy", file: next });
		}
	}
	summarize(run);
	if (sim.ticks % 3 === 0) updateEta(run, sim);
	const finished = run.files.filter(
		(f) => f.status !== "running" && f.status !== "queued",
	).length;
	run.phase = `running ${finished}/${run.fileCount}`;
	emit(run.id, { type: "status", status: run.status, phase: run.phase });
	if (finished === run.fileCount) {
		for (const w of run.workers)
			setWorker(run, { ...w, status: "dead", file: null });
		releaseAccounts((a) => a.runId === run.id);
		run.workerCount = sim.peakWorkers;
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
	workerCap: 120,
	startWorkers: 26,
});
startLiveRun({
	branch: "capy/twd",
	sha: branches[9].sha,
	selection: { groups: ["billing-v2", "track"] },
	createdBy: ACTORS[3],
	workerCap: 24,
	pinnedSha: true,
});
// A long branch stuck building its image: sized at warm start, but no accounts asked for until the build lands.
startLiveRun({
	branch: "capy/revenuecat-customer-products-are-not-synced-after-transfer",
	sha: hex(40),
	selection: { files: filesForSelection({ groups: ["track"] }).slice(0, 3) },
	createdBy: ACTORS[3],
	workerCap: 3,
	startWorkers: 0,
	warmForMs: Number.POSITIVE_INFINITY,
});
startLiveRun({
	branch: "fix/cross-group-license-carry",
	sha: branches[3].sha,
	selection: { groups: ["billing"] },
	createdBy: ACTORS[5],
	workerCap: 48,
	queuedForMs: 90_000,
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
	if (!f || f.status === "queued") return null;
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
const capacity = (): Capacity => {
	const counts = countStates(accounts);
	const live = runs.filter(isLive);
	const usableKeys = keys.filter((k) => k.usable).length;
	return {
		gate: gate.state,
		usableKeys,
		accounts: counts,
		liveRuns: live.length,
		queuedRuns: live.filter((r) => r.queuePosition !== null).length,
		accountsWanted: live
			.filter((r) => r.status !== "warming")
			.reduce(
				(sum, r) =>
					sum + Math.max(0, (r.workersWanted ?? 0) - (r.workerCount ?? 0)),
				0,
			),
		slotsAwaitingWarm: live
			.filter((r) => r.status === "warming")
			.reduce((sum, r) => sum + (r.workersWanted ?? 0), 0),
		poolCap: usableKeys * 3,
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
	if (route === "GET /branches" || route === "POST /branches/refresh")
		return ok(branches);
	if (route === "GET /capacity") return ok(capacity());
	if (route === "GET /keys") return ok(keysOverview());
	if (route === "GET /accounts") return ok(accounts);
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

	if (route === "GET /files/history") {
		const file = url.searchParams.get("file") ?? "";
		const r = rng(file.length * 7919);
		const base = 20_000 + r() * 90_000;
		const shas = Array.from({ length: 8 }, () => hex(40, r));
		const results = Array.from({ length: 40 }, (_, i) => {
			const sha = shas[Math.floor(i / 5)] ?? shas[0];
			const slow = i >= 25 ? 1.6 : 1;
			const failed = r() < 0.06;
			return {
				runId: `run_${hex(10, r)}`,
				branch: i % 3 ? "dev" : "feat/usage-alerts",
				sha,
				status: failed ? ("failed" as const) : ("passed" as const),
				durationMs: Math.round(base * slow * (0.8 + r() * 0.4)),
				attempt: 1,
				repetition: null,
				passedTests: 5,
				failedTests: failed ? 1 : 0,
				worker: null,
				failureSummary: null,
				createdAt: iso(Date.now() - (40 - i) * 3 * 3_600_000),
			};
		}).reverse();
		const byCommit = shas.map((sha) => {
			const rows = results.filter((x) => x.sha === sha);
			const ds = rows.map((x) => x.durationMs).sort((a, b) => a - b);
			return {
				sha,
				branch: rows[0]?.branch ?? "dev",
				runs: rows.length,
				p50Ms: ds[Math.floor((ds.length - 1) / 2)] ?? 0,
				maxMs: ds.at(-1) ?? 0,
				passRate:
					rows.filter((x) => x.status === "passed").length / (rows.length || 1),
				firstAt: rows.at(-1)?.createdAt ?? iso(Date.now()),
				lastAt: rows[0]?.createdAt ?? iso(Date.now()),
			};
		});
		return ok({
			file,
			baseline: {
				file,
				p50Ms: base,
				p90Ms: base * 1.2,
				passRate: 0.97,
				samples: 20,
				updatedAt: iso(Date.now()),
			},
			results,
			byCommit,
		});
	}

	if (route === "GET /runs/branches") {
		const branch = url.searchParams.get("branch");
		const byBranch = new Map<string, RunSummary[]>();
		for (const r of allSummaries())
			if (!isLive(r) && (!branch || r.branch.includes(branch)))
				byBranch.set(r.branch, [...(byBranch.get(r.branch) ?? []), r]);
		const list = [...byBranch].map(([name, list]) => ({
			branch: name,
			runs: list.slice(0, BRANCH_HISTORY_RUNS),
		}));
		const limit = Number(url.searchParams.get("limit") ?? 30);
		const start = Number(url.searchParams.get("cursor") ?? 0);
		const end = start + limit;
		return ok({
			branches: list.slice(start, end),
			nextCursor: end < list.length ? String(end) : null,
		});
	}

	if (route === "GET /runs/stats") {
		const since = Date.parse(url.searchParams.get("since") ?? "");
		const today = allSummaries().filter(
			(r) => Date.parse(r.createdAt) >= since,
		);
		return ok({
			runs: today.length,
			usd: today.reduce((sum, r) => sum + r.cost.usd, 0),
		});
	}

	if (route === "GET /runs") {
		const status = url.searchParams.get("status") ?? "live";
		const branch = url.searchParams.get("branch");
		const purpose = url.searchParams.get("purpose");
		const baseline = url.searchParams.get("baseline");
		const exactBranch = url.searchParams.get("exactBranch");
		const list = allSummaries()
			.filter((r) =>
				status === "all" ? true : status === "live" ? isLive(r) : !isLive(r),
			)
			.filter((r) => !branch || r.branch.includes(branch))
			.filter((r) => !exactBranch || r.branch === exactBranch)
			.filter((r) => !purpose || r.purpose === purpose)
			.filter((r) => !baseline || r.baseline === (baseline === "true"))
			.filter((r) => {
				const outcome = url.searchParams.get("outcome") ?? "all";
				if (outcome === "all") return true;
				if (outcome === "failed")
					return r.status === "failed" || r.status === "errored";
				return r.status === outcome;
			});
		const limit = Number(url.searchParams.get("limit") ?? 50);
		const start = Number(url.searchParams.get("cursor") ?? 0);
		const end = start + limit;
		return ok({
			runs: list.slice(start, end),
			nextCursor: end < list.length ? String(end) : null,
			total: list.length,
		});
	}

	if (route === "POST /runs") {
		const b = body as {
			branch: string;
			sha?: string;
			selection: RunSummary["selection"];
			purpose?: RunSummary["purpose"];
			repeat?: number;
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
		const parsed = CreateRunBody.safeParse(b);
		if (!parsed.success)
			return err(
				400,
				"invalid_request",
				parsed.error.issues
					.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
					.join("; "),
				"Fix the request to match src/api/contract.ts and retry.",
			);
		const count = filesForSelection(b.selection).length;
		if (!count)
			return err(
				422,
				"empty_selection",
				"The selection matched no test files.",
				"Pick at least one group or file, or loosen the grep.",
			);
		let run: RunDetail;
		try {
			run = startLiveRun({
				branch: branch.name,
				sha: b.sha ?? branch.sha,
				pinnedSha: b.sha !== undefined,
				selection: b.selection,
				createdBy: { userId: ME.userId, email: ME.email, via: ME.via },
				purpose: b.purpose,
				repeat: parsed.data.repeat,
				workerCap: 120,
				startWorkers: 10,
				queuedForMs: capacity().accounts.clean === 0 ? 30_000 : 0,
			});
		} catch (error) {
			if (!(error instanceof TwdError)) throw error;
			return err(error.status, error.code, error.message, error.next);
		}
		return ok(summary(run));
	}

	if (seg[0] === "runs" && seg[1]) {
		const run = findRun(seg[1]);
		if (!run)
			return err(
				404,
				"run_not_found",
				`No run ${seg[1]}.`,
				"List runs with GET /runs?status=all.",
			);
		if (method === "GET" && seg.length === 2) return ok(run);
		if (method === "GET" && seg[2] === "logs" && seg[3] === "failed") {
			const failed = run.files.filter((f) => isFailedFileStatus(f.status));
			return ok(
				failed
					.map(
						(f) =>
							`===== ${f.file} (${f.status} · attempt ${f.attempt}) =====\n${fileLog(run, f.file) ?? ""}`,
					)
					.join("\n"),
			);
		}
		if (method === "GET" && seg[2] === "logs") {
			const worker = url.searchParams.get("worker");
			const file = url.searchParams.get("file");
			if (file) return ok(fileLog(run, file) ?? "");
			const files = run.files.filter((f) => !worker || f.worker === worker);
			return ok(
				`[tw-boot] ${worker ?? "run"} booted\n` +
					files
						.slice(0, 5)
						.map((f) => fileLog(run, f.file) ?? "")
						.join("\n"),
			);
		}
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
			const failed = [
				...new Set(
					run.files
						.filter((f) => isFailedFileStatus(f.status))
						.map((f) => splitRepetitionId({ id: f.file }).file),
				),
			];
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
				pinnedSha: run.pinnedSha,
				selection: { files: failed },
				createdBy: { userId: ME.userId, email: ME.email, via: ME.via },
				repeat: run.repeat,
			});
			return ok(summary(next));
		}
	}

	if (route === "POST /keys/import") {
		const text = String((body as { text?: string } | undefined)?.text ?? "");
		const parsed = [
			...new Set(
				text.split(/[\s,;]+/).filter((t) => /^(sk|rk)_test_\w+$/.test(t)),
			),
		];
		return ok({
			parsed: parsed.length,
			added: parsed.length,
			alreadyPresent: 0,
			usable: Math.max(0, parsed.length - 1),
			unusable: parsed.length
				? [
						{
							keyHint: `${parsed[0].slice(0, 8)}…${parsed[0].slice(-4)}`,
							reason: "Connect is not enabled on this platform account",
						},
					]
				: [],
		});
	}
	if (method === "DELETE" && seg[0] === "keys" && seg[1]) {
		const k = keys.find(
			(x) => x.platformAccountId === decodeURIComponent(seg[1]),
		);
		if (k)
			Object.assign(k, {
				present: false,
				usable: false,
				unusableReason: "removed from twd",
			});
		return ok({ platformAccountId: decodeURIComponent(seg[1]) });
	}
	if (route === "POST /keys/probe") {
		for (const k of keys) k.probedAt = iso(Date.now());
		return ok(keysOverview());
	}
	if (
		route === "POST /keys/reinit" &&
		(body as { scope?: string } | undefined)?.scope &&
		(body as { scope?: string }).scope !== "all"
	) {
		const res = enqueue(
			"reinit_keys",
			`reinit_keys:${(body as { scope: string }).scope}`,
		);
		setTimeout(() => {
			res.job.status = "succeeded";
			res.job.finishedAt = iso(Date.now());
			for (const k of keys) if (k.usable) k.webhookRegistered = true;
		}, 8_000);
		return ok(res);
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

	if (route === "GET /jobs") return ok({ jobs });

	if (route === "GET /costs") {
		const from = url.searchParams.get("from");
		const to = url.searchParams.get("to");
		const bucket = url.searchParams.get("bucket") === "week" ? "week" : "day";
		return ok(
			costsReport({
				from: from ? Date.parse(from) : Date.now() - 29 * DAY,
				to: to ? Date.parse(to) + DAY - 1 : Date.now(),
				bucket,
			}),
		);
	}

	if (method === "POST" && seg[0] === "keys" && seg[2] === "full-nuke") {
		const pid = decodeURIComponent(seg[1]);
		const key = keys.find((k) => k.platformAccountId === pid);
		if (!key)
			return err(
				404,
				"key_not_found",
				`No key for platform account ${pid}.`,
				"GET /keys for valid platform account ids.",
			);
		if (!key.present)
			return err(
				409,
				"key_not_in_env",
				`${pid} is no longer in TW_V3_KEYS.`,
				"Nothing to nuke with; pick a key that is present.",
				"Ask a twd admin to add the key back to TW_V3_KEYS.",
			);
		const target = (body as { targetPerKey?: number } | undefined)
			?.targetPerKey;
		return ok(fullNukeKey({ key, targetPerKey: target ?? 2 }));
	}

	if (route === "POST /accounts/nuke") {
		const ids = (body as { accountIds?: string[] } | undefined)?.accountIds;
		const found = accounts.filter((a) => ids?.includes(a.id));
		const held = found.filter((a) => a.state === "in_use");
		if (held.length)
			return err(
				409,
				"accounts_held",
				`Accounts are held by a run: ${held.map((a) => a.id).join(", ")}.`,
				"Wait for the run to finish; its teardown nukes them.",
			);
		const res = found.map((a) => enqueue("nuke", `nuke:${a.id}`));
		releaseAccounts((a) => found.includes(a));
		for (const r of res)
			setTimeout(() => {
				r.job.status = "succeeded";
				r.job.finishedAt = iso(Date.now());
			}, 8_000);
		return ok(res);
	}

	if (route === "POST /accounts/retry-broken") {
		if (gate.state === "draining")
			return err(
				409,
				"keys_draining",
				"A key re-init is in progress.",
				"Wait for the reinit_keys job to finish (GET /keys shows the gate), then retry.",
			);
		const broken = accounts.filter((a) => a.state === "broken");
		const retryable = broken.filter((a) =>
			keys.some(
				(k) =>
					k.platformAccountId === a.platformAccountId &&
					k.present &&
					k.unusableReason !== FULL_NUKE_REASON,
			),
		);
		const res = retryable.map((a) => enqueue("nuke", `nuke:${a.id}`));
		const fresh = retryable.filter((_, i) => !res[i].deduped);
		releaseAccounts((a) => fresh.includes(a));
		for (const r of res)
			setTimeout(() => {
				r.job.status = "succeeded";
				r.job.finishedAt = iso(Date.now());
			}, 8_000);
		return ok({
			enqueued: fresh.length,
			skipped: broken.length - fresh.length,
		});
	}

	if (method === "DELETE" && seg[0] === "accounts" && seg[1]) {
		const i = accounts.findIndex((a) => a.id === seg[1]);
		if (i === -1)
			return err(
				404,
				"account_not_found",
				`${seg[1]} is not in the twd ledger.`,
				"GET /accounts for valid ids.",
			);
		const a = accounts[i];
		if (a.state === "in_use")
			return err(
				409,
				"account_held",
				`${a.id} is in use by ${a.runId}.`,
				"Wait for the run to finish, then forget it.",
			);
		accounts.splice(i, 1);
		return ok(a);
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
	if (topic === "runs") return allSummaries();
	if (topic === "jobs") return jobs;
	if (topic === "capacity") return capacity();
	if (topic.startsWith("run:")) return findRun(topic.slice(4)) ?? null;
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
	if (changed("accounts", accounts))
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
