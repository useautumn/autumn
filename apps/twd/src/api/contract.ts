/**
 * The ONE twd API. Dashboard, `bun tw`, and agents all use exactly these routes.
 * Server handlers and the web client both import these schemas; never fork them.
 */
import { z } from "zod";

// ---- shared ---------------------------------------------------------------

export const ActorRef = z.object({
	userId: z.string(),
	email: z.string(),
	via: z.string(),
});

export const RunStatus = z.enum([
	"queued",
	"warming",
	"provisioning",
	"running",
	"tearing_down",
	"passed",
	"failed",
	"cancelled",
	"errored",
]);

export const RunSelection = z.object({
	groups: z.array(z.string()).optional(),
	files: z.array(z.string()).optional(),
	grep: z.string().optional(),
});

export const FileResultStatus = z.enum([
	"queued",
	"running",
	"passed",
	"failed",
	"crashed",
	"skipped",
]);

export const DriftKind = z.enum(["new_failure", "slow"]);

export const Drift = z.object({
	file: z.string(),
	kind: DriftKind,
	/** slow: branch duration vs baseline p90. new_failure: baseline pass rate. */
	branchValue: z.number(),
	baselineValue: z.number(),
});

// ---- me / auth ------------------------------------------------------------

export const Me = z.object({
	userId: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	via: z.string(),
});

export const ApiKey = z.object({
	id: z.string(),
	name: z.string(),
	prefix: z.string(),
	ownerEmail: z.string(),
	lastUsedAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	createdAt: z.string(),
});
export const CreateApiKeyBody = z.object({ name: z.string().min(1).max(80) });
export const CreateApiKeyResponse = z.object({
	apiKey: ApiKey,
	/** Plaintext, returned exactly once. */
	secret: z.string(),
});

// ---- catalog (test discovery) --------------------------------------------

export const TestGroup = z.object({
	name: z.string(),
	tier: z.enum(["core", "domain", "suite"]),
	description: z.string(),
	fileCount: z.number(),
});
export const TestFile = z.object({
	path: z.string(),
	groups: z.array(z.string()),
	baselineP90Ms: z.number().nullable(),
});
export const Catalog = z.object({
	groups: z.array(TestGroup),
	files: z.array(TestFile),
});
export const Branch = z.object({
	name: z.string(),
	sha: z.string(),
	prNumber: z.number().nullable(),
	warm: z.enum(["ready", "building", "failed", "none"]),
});

// ---- runs -----------------------------------------------------------------

/** Flake checks only: 50 clean first attempts bound a flake rate near 6% (95% confidence). */
export const MAX_REPEAT = 50;

export const CreateRunBody = z
	.object({
		branch: z.string().min(1),
		/** Defaults to the branch head. */
		sha: z.string().optional(),
		selection: RunSelection,
		/** Cap on workers for this run (default: one per file, bounded by the key budget). */
		maxWorkers: z.number().int().min(1).max(5_000).optional(),
		purpose: z.enum(["adhoc", "baseline"]).default("adhoc"),
		/** Runs each selected file N times, each as its own work item; only for checking a flaky test. */
		repeat: z.number().int().min(1).max(MAX_REPEAT).default(1),
	})
	.refine((body) => body.purpose !== "baseline" || body.repeat === 1, {
		message: "baseline runs cannot repeat",
		path: ["repeat"],
	});

export const WorkerBoot = z.object({
	/** Ordered boot phases: orchestrator-side (modal create, tunnel, exec, ready seen, ingress) and in-sandbox. */
	steps: z.array(z.object({ step: z.string(), ms: z.number() })),
	totalMs: z.number().nullable(),
});
export const WorkerState = z.object({
	name: z.string(),
	status: z.enum([
		"provisioning",
		"booting",
		"ready",
		"busy",
		"dead",
		"failed",
	]),
	file: z.string().nullable(),
	boot: WorkerBoot.nullable().optional(),
	/** When the worker was mapped and serving. */
	readyAt: z.string().nullable().optional(),
});
/** Run-level phase boundaries not derivable from workers/files. */
export const RunMilestones = z.object({
	warmReadyAt: z.string().nullable(),
	accountsAt: z.string().nullable(),
});

export const RunFile = z.object({
	/** server/tests-relative path; `<path>#<k>` is repetition k of a repeat run. */
	file: z.string(),
	status: FileResultStatus,
	durationMs: z.number().nullable(),
	attempt: z.number(),
	passedTests: z.number(),
	failedTests: z.number(),
	worker: z.string().nullable(),
	failureSummary: z.string().nullable(),
	/** When twd saw the file's final result (latest attempt). */
	finishedAt: z.string().nullable().optional(),
});

/** Modal compute cost of a run: Σ worker lifetime × (cores × core rate + GiB × memory rate). */
export const RunCost = z.object({
	usd: z.number(),
	workerSeconds: z.number(),
	/** false while the run is live (accruing). */
	final: z.boolean(),
});

export const RunSummary = z.object({
	id: z.string(),
	branch: z.string(),
	sha: z.string(),
	/** True when the caller pinned `sha` directly; the UI then labels the run by commit, not branch. */
	pinnedSha: z.boolean(),
	status: RunStatus,
	purpose: z.enum(["adhoc", "baseline"]),
	selection: RunSelection,
	/** Times each selected file runs; > 1 only for flake checks. */
	repeat: z.number(),
	/** Work items: files × repeat. */
	fileCount: z.number().nullable(),
	/** Workers currently attached; grows as accounts free up (elastic, FIFO). */
	workerCount: z.number().nullable(),
	/** Workers this run wants: min(files, key budget). */
	workersWanted: z.number().nullable(),
	/** 1-based place in the FIFO account queue while waiting for any account; null otherwise. */
	queuePosition: z.number().nullable(),
	cost: RunCost,
	passed: z.number(),
	failed: z.number(),
	createdBy: ActorRef,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});

/** One file of a repeat run: firstAttemptPassed/total is its pass rate. */
export const RepeatStat = z.object({
	file: z.string(),
	total: z.number(),
	done: z.number(),
	firstAttemptPassed: z.number(),
	passedOnRetry: z.number(),
	failed: z.number(),
});

export const RunDetail = RunSummary.extend({
	phase: z.string().nullable(),
	workers: z.array(WorkerState),
	files: z.array(RunFile),
	/** Empty unless repeat > 1; drift is skipped for repeat runs. */
	repeats: z.array(RepeatStat),
	drift: z.array(Drift),
	milestones: RunMilestones.nullable().optional(),
});

export const RunOutcome = z.enum(["all", "passed", "failed", "cancelled"]);
export const ListRunsQuery = z.object({
	status: z.enum(["live", "finished", "all"]).default("live"),
	/** Narrows finished runs; "failed" includes errored. */
	outcome: RunOutcome.default("all"),
	/** Substring match on branch name. */
	branch: z.string().optional(),
	/** Opaque `nextCursor` from the previous page. */
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const RunsPage = z.object({
	runs: z.array(RunSummary),
	nextCursor: z.string().nullable(),
	total: z.number(),
});

/** SSE event on GET /runs/:id/events. */
export const RunEvent = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("status"),
		status: RunStatus,
		phase: z.string().nullable(),
		milestones: RunMilestones.optional(),
	}),
	z.object({ type: z.literal("worker"), worker: WorkerState }),
	z.object({ type: z.literal("file"), file: RunFile }),
	z.object({
		type: z.literal("log"),
		file: z.string().nullable(),
		worker: z.string().nullable(),
		text: z.string(),
	}),
]);

// ---- keys -----------------------------------------------------------------

export const StripeKey = z.object({
	platformAccountId: z.string(),
	keyHint: z.string(),
	displayName: z.string().nullable(),
	usable: z.boolean(),
	unusableReason: z.string().nullable(),
	webhookRegistered: z.boolean(),
	present: z.boolean(),
	probedAt: z.string().nullable(),
	accounts: z.object({
		clean: z.number(),
		inUse: z.number(),
		nuking: z.number(),
		broken: z.number(),
	}),
});
export const KeyGate = z.object({
	state: z.enum(["open", "draining"]),
	reason: z.string().nullable(),
	jobId: z.string().nullable(),
});
/** all = drain every run + replace every webhook (only needed when the public URL changes). */
export const ReinitScope = z.enum([
	"all",
	"missing_webhooks",
	"unhealthy",
	"selected",
]);
export const ReinitKeysBody = z.object({
	scope: ReinitScope.default("all"),
	/** Required for scope=selected. */
	platformAccountIds: z.array(z.string()).optional(),
	/** Accounts to top each touched key up to (default 0 for all, 2 for scoped). */
	targetPerKey: z.number().int().min(0).max(200).optional(),
});
export const ImportKeysBody = z.object({ text: z.string().min(1) });
export const ImportKeysResponse = z.object({
	parsed: z.number(),
	added: z.number(),
	alreadyPresent: z.number(),
	usable: z.number(),
	unusable: z.array(z.object({ keyHint: z.string(), reason: z.string() })),
});
export const KeysOverview = z.object({
	gate: KeyGate,
	keys: z.array(StripeKey),
});

// ---- accounts ---------------------------------------------------------------

export const StripeAccount = z.object({
	id: z.string(),
	platformAccountId: z.string(),
	state: z.enum(["clean", "in_use", "nuking", "broken"]),
	heldBy: z.string().nullable(),
	runId: z.string().nullable(),
	stateChangedAt: z.string(),
	/** Why the account is broken (last nuke/verify error); null otherwise. */
	brokenReason: z.string().nullable(),
});

// ---- jobs -----------------------------------------------------------------

export const Job = z.object({
	id: z.string(),
	kind: z.enum(["warm", "swarm", "nuke", "reinit_keys", "full_nuke_key"]),
	singletonKey: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
	error: z.string().nullable(),
	attempts: z.number(),
	createdBy: ActorRef,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});
/** Returned by every enqueueing route: \`deduped\` = attached to an existing live job. */
export const EnqueueResponse = z.object({ job: Job, deduped: z.boolean() });

// ---- capacity + errors ---------------------------------------------------

export const Capacity = z.object({
	gate: z.enum(["open", "draining"]),
	usableKeys: z.number(),
	accounts: z.object({
		clean: z.number(),
		inUse: z.number(),
		nuking: z.number(),
		broken: z.number(),
	}),
	liveRuns: z.number(),
	/** Runs waiting in the FIFO queue for their first account. */
	queuedRuns: z.number(),
	/** Accounts live runs still want beyond what they hold. */
	accountsWanted: z.number(),
	/** Pool ceiling: usable keys × per-key cap. */
	poolCap: z.number(),
	/** Largest run (in files) that can start right now without waiting. */
	maxFilesNow: z.number(),
	warmBuilds: z.number(),
});

/**
 * Every non-2xx response. Written for agents: \`next\` is what to do now,
 * \`escalate\` is set when only a human can unblock it.
 */
export const ApiError = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		next: z.string(),
		escalate: z.string().nullable(),
		details: z.record(z.unknown()).optional(),
	}),
});

// ---- live (WebSocket GET /ws) ---------------------------------------------

/**
 * Topics: "runs" (every run's summary), "run:<id>" (that run's worker/file/log stream),
 * "jobs", "keys", "accounts", "capacity", "warm". Subscribing sends a snapshot first.
 */
export const LiveTopic = z
	.string()
	.regex(/^(runs|jobs|keys|accounts|capacity|warm|run:[\w-]+)$/);

export const LiveEvent = z.discriminatedUnion("type", [
	z.object({ type: z.literal("run.updated"), run: RunSummary }),
	z.object({
		type: z.literal("run.event"),
		runId: z.string(),
		event: RunEvent,
	}),
	z.object({ type: z.literal("job.updated"), job: Job }),
	z.object({ type: z.literal("capacity.updated"), capacity: Capacity }),
	/** Refetch GET /keys; debounced, sent after probes, reinit steps, gate changes. */
	z.object({ type: z.literal("keys.changed") }),
	/** Refetch GET /accounts; debounced. */
	z.object({ type: z.literal("accounts.changed") }),
	z.object({
		type: z.literal("warm.updated"),
		sha: z.string(),
		branch: z.string(),
		status: z.enum(["building", "ready", "failed"]),
	}),
]);

export const LiveClientMessage = z.discriminatedUnion("type", [
	z.object({ type: z.literal("subscribe"), topics: z.array(LiveTopic).min(1) }),
	z.object({
		type: z.literal("unsubscribe"),
		topics: z.array(LiveTopic).min(1),
	}),
	z.object({ type: z.literal("ping") }),
]);

export const LiveServerMessage = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("hello"),
		connectionId: z.string(),
		actor: ActorRef,
	}),
	/** Full state of a topic, sent on subscribe and after the server drops events for a slow client. */
	z.object({
		type: z.literal("snapshot"),
		topic: LiveTopic,
		data: z.union([
			z.array(RunSummary),
			RunDetail,
			z.array(Job),
			Capacity,
			z.null(),
		]),
	}),
	/** seq is per-connection and gap-free; a gap means reconnect + resubscribe. */
	z.object({
		type: z.literal("event"),
		topic: LiveTopic,
		seq: z.number(),
		event: LiveEvent,
	}),
	z.object({ type: z.literal("pong") }),
	z.object({ type: z.literal("error"), error: ApiError.shape.error }),
]);

// ---- costs ------------------------------------------------------------------

export const CostRates = z.object({
	usdPerCoreSecond: z.number(),
	usdPerGibSecond: z.number(),
	workerCores: z.number(),
	workerMemoryGib: z.number(),
});
export const CostsQuery = z.object({
	/** ISO dates; default the last 30 days. */
	from: z.string().optional(),
	to: z.string().optional(),
	bucket: z.enum(["day", "week"]).default("day"),
});
export const Costs = z.object({
	rates: CostRates,
	totals: z.object({
		usd: z.number(),
		runs: z.number(),
		workerSeconds: z.number(),
		warmUsd: z.number(),
	}),
	/** Time series for the chart; one row per bucket, per-user split in `byUser`. */
	buckets: z.array(
		z.object({
			start: z.string(),
			usd: z.number(),
			warmUsd: z.number(),
			runs: z.number(),
			/** email → run cost (excludes warm builds, which are `warmUsd`). */
			byUser: z.record(z.number()),
		}),
	),
	users: z.array(
		z.object({
			userId: z.string(),
			email: z.string(),
			usd: z.number(),
			runs: z.number(),
		}),
	),
	/** Most expensive runs in the window. */
	topRuns: z.array(RunSummary),
});

// ---- route table ----------------------------------------------------------

/**
 * Every route, `METHOD path`. Handlers live in src/http/routes/<domain>.ts.
 * All require auth except /auth/*, /webhooks/*, /ingress/*, /health.
 */
export const ROUTES = {
	health: "GET /health",

	// auth (http/routes/auth.ts)
	authGoogleStart: "GET /auth/google",
	authGoogleCallback: "GET /auth/google/callback",
	authLogout: "POST /auth/logout",
	me: "GET /me",
	listApiKeys: "GET /api-keys",
	createApiKey: "POST /api-keys",
	revokeApiKey: "DELETE /api-keys/:id",

	// catalog (http/routes/catalog.ts)
	catalog: "GET /catalog",
	branches: "GET /branches",
	/** Drops the cached open-PR list (1 min TTL) and returns fresh branches. */
	refreshBranches: "POST /branches/refresh",
	warmBranch: "POST /branches/:branch/warm",

	// runs (http/routes/runs.ts)
	listRuns: "GET /runs",
	createRun: "POST /runs",
	getRun: "GET /runs/:id",
	runEvents: "GET /runs/:id/events",
	fileLog: "GET /runs/:id/files/log?file=",
	/** text/plain. No params = whole run; ?file= one file; ?worker= one worker (incl. its server output); ?scope=run orchestrator only. */
	runLogs: "GET /runs/:id/logs",
	/** text/plain: every failed/crashed file's output under a header. */
	failedLogs: "GET /runs/:id/logs/failed",
	cancelRun: "POST /runs/:id/cancel",
	rerunFailed: "POST /runs/:id/rerun-failed",

	// keys (http/routes/keys.ts)
	keys: "GET /keys",
	probeKeys: "POST /keys/probe",
	reinitKeys: "POST /keys/reinit",
	/** Additive paste: any-separator list of sk_test_ keys; existing ones are skipped. */
	importKeys: "POST /keys/import",
	/** Drops the stored secret; Stripe untouched. Refused while accounts on it are in use. */
	removeKey: "DELETE /keys/:platformAccountId",
	/** Deletes every connected account + webhook on one key (rate-limited), re-registers, tops up. */
	fullNukeKey: "POST /keys/:platformAccountId/full-nuke",

	// accounts (http/routes/accounts.ts)
	listAccounts: "GET /accounts",
	nukeAccounts: "POST /accounts/nuke",
	/** Drop an account from the ledger (e.g. deleted in Stripe). Not allowed while held by a run. */
	forgetAccount: "DELETE /accounts/:id",

	// jobs (http/routes/jobs.ts)
	listJobs: "GET /jobs",
	getJob: "GET /jobs/:id",
	cancelJob: "POST /jobs/:id/cancel",

	// results (http/routes/results.ts)
	baselines: "GET /baselines",
	costs: "GET /costs",
	fileHistory: "GET /files/history?file=",

	// capacity + MCP (http/routes/capacity.ts, http/routes/mcp.ts)
	capacity: "GET /capacity",
	mcp: "POST /mcp",
	live: "GET /ws (WebSocket; cookie, Authorization: Bearer, or ?token=twd_…)",

	// unauthenticated machine endpoints
	githubWebhook: "POST /webhooks/github",
	ingressConnect: "POST /ingress/connect/:env",
	ingressMap: "POST /ingress/map",
} as const;

export type Me = z.infer<typeof Me>;
export type ApiKey = z.infer<typeof ApiKey>;
export type Catalog = z.infer<typeof Catalog>;
export type Branch = z.infer<typeof Branch>;
export type CreateRunBody = z.infer<typeof CreateRunBody>;
export type RunSummary = z.infer<typeof RunSummary>;
export type RunsPage = z.infer<typeof RunsPage>;
export type RunDetail = z.infer<typeof RunDetail>;
export type RunFile = z.infer<typeof RunFile>;
export type RepeatStat = z.infer<typeof RepeatStat>;
export type RunEvent = z.infer<typeof RunEvent>;
export type WorkerState = z.infer<typeof WorkerState>;
export type WorkerBoot = z.infer<typeof WorkerBoot>;
export type RunMilestones = z.infer<typeof RunMilestones>;
export type Drift = z.infer<typeof Drift>;
export type StripeKey = z.infer<typeof StripeKey>;
export type ReinitScope = z.infer<typeof ReinitScope>;
export type ImportKeysResponse = z.infer<typeof ImportKeysResponse>;
export type KeysOverview = z.infer<typeof KeysOverview>;
export type StripeAccount = z.infer<typeof StripeAccount>;
export type Capacity = z.infer<typeof Capacity>;
export type ApiError = z.infer<typeof ApiError>;
export type LiveTopic = z.infer<typeof LiveTopic>;
export type LiveEvent = z.infer<typeof LiveEvent>;
export type LiveClientMessage = z.infer<typeof LiveClientMessage>;
export type LiveServerMessage = z.infer<typeof LiveServerMessage>;
export type RunCost = z.infer<typeof RunCost>;
export type Costs = z.infer<typeof Costs>;
export type CostRates = z.infer<typeof CostRates>;
export type CostsQuery = z.infer<typeof CostsQuery>;
export type Job = z.infer<typeof Job>;
export type EnqueueResponse = z.infer<typeof EnqueueResponse>;
