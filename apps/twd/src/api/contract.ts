import { z } from "zod";

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
	"timed_out",
	"skipped",
]);

const FAILED_FILE_STATUSES = ["failed", "crashed", "timed_out"] as const;
export const isFailedFileStatus = (status: string) =>
	(FAILED_FILE_STATUSES as readonly string[]).includes(status);

export const DriftKind = z.enum(["new_failure", "slow"]);

export const Drift = z.object({
	file: z.string(),
	kind: DriftKind,
	branchValue: z.number(),
	baselineValue: z.number(),
});

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
	secret: z.string(),
});

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

export const MAX_REPEAT = 50;

export const MAX_FILES_PER_WORKER = 8;

export const CreateRunBody = z
	.object({
		branch: z.string().min(1),
		sha: z.string().optional(),
		selection: RunSelection,
		maxWorkers: z.number().int().min(1).max(5_000).optional(),
		maxFilesPerWorker: z
			.number()
			.int()
			.min(1)
			.max(MAX_FILES_PER_WORKER)
			.optional(),
		purpose: z.enum(["adhoc", "baseline"]).default("adhoc"),
		repeat: z.number().int().min(1).max(MAX_REPEAT).default(1),
	})
	.refine((body) => body.purpose !== "baseline" || body.repeat === 1, {
		message: "baseline runs cannot repeat",
		path: ["repeat"],
	})
	.refine(
		(body) =>
			body.maxWorkers === undefined || body.maxFilesPerWorker === undefined,
		{
			message: "set maxWorkers or maxFilesPerWorker, not both (neither = Auto)",
			path: ["maxFilesPerWorker"],
		},
	)
	.refine((body) => body.repeat === 1 || (body.maxFilesPerWorker ?? 1) === 1, {
		message: "repeat runs keep one file per worker (repetitions share ids)",
		path: ["maxFilesPerWorker"],
	});

export const WorkerBoot = z.object({
	steps: z.array(z.object({ step: z.string(), ms: z.number() })),
	totalMs: z.number().nullable(),
});
export const WorkerStatus = z.enum([
	"provisioning",
	"booting",
	"ready",
	"busy",
	"dead",
	"failed",
]);
export const WorkerState = z.object({
	name: z.string(),
	status: WorkerStatus,
	file: z.string().nullable(),
	boot: WorkerBoot.nullable().optional(),
	readyAt: z.string().nullable().optional(),
});
export const RunMilestones = z.object({
	warmReadyAt: z.string().nullable(),
	accountsAt: z.string().nullable(),
});

export const RunFile = z.object({
	file: z.string(),
	status: FileResultStatus,
	durationMs: z.number().nullable(),
	attempt: z.number(),
	passedTests: z.number(),
	failedTests: z.number(),
	worker: z.string().nullable(),
	failureSummary: z.string().nullable(),
	finishedAt: z.string().nullable().optional(),
});

export const RunLive = z.object({
	workers: z.record(WorkerStatus, z.number()),
	etaMs: z.number().nullable(),
	accountsPending: z.number(),
});

export const RunCost = z.object({
	usd: z.number(),
	workerSeconds: z.number(),
	final: z.boolean(),
});

export const RunSummary = z.object({
	id: z.string(),
	branch: z.string(),
	sha: z.string(),
	pinnedSha: z.boolean(),
	status: RunStatus,
	purpose: z.enum(["adhoc", "baseline"]),
	baseline: z.boolean(),
	selection: RunSelection,
	repeat: z.number(),
	fileCount: z.number().nullable(),
	workerCount: z.number().nullable(),
	workersWanted: z.number().nullable(),
	queuePosition: z.number().nullable(),
	cost: RunCost,
	passed: z.number(),
	failed: z.number(),
	newFailures: z.number().nullable(),
	live: RunLive.nullable(),
	createdBy: ActorRef,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});

export const RepeatStat = z.object({
	file: z.string(),
	total: z.number(),
	done: z.number(),
	firstAttemptPassed: z.number(),
	passedOnRetry: z.number(),
	failed: z.number(),
});

export const RunResources = z.object({
	attempts: z.number(),
	stripeRequests: z.number(),
	rateLimited: z.number(),
	permitWaitP95Ms: z.number().nullable(),
	permitWaitMaxMs: z.number().nullable(),
	workerPeakRps: z.number().nullable(),
	workerPeakInFlight: z.number().nullable(),
	cpuCoreSeconds: z.number().nullable(),
	cpuPeakCoresP95: z.number().nullable(),
	memPeakMibP95: z.number().nullable(),
	memPeakMibMax: z.number().nullable(),
});

export const RunSizing = z.object({
	mode: z.enum(["auto", "max_workers", "max_files_per_worker"]),
	filesPerWorker: z.number(),
	workers: z.number(),
	packedFiles: z.number(),
	soloFiles: z.number(),
	targetWallMs: z.number().nullable(),
	predictedWallMs: z.number().nullable(),
	limits: z.object({
		headroom: z.number(),
		stripeRps: z.number(),
		stripeInFlight: z.number(),
		cores: z.number(),
		memoryMib: z.number(),
	}),
	load: z
		.object({
			stripeRps: z.number(),
			stripeInFlight: z.number(),
			cores: z.number(),
			memoryMib: z.number(),
		})
		.nullable(),
	binding: z.string().nullable(),
	reasons: z.array(z.string()),
});

export const RunDetail = RunSummary.extend({
	phase: z.string().nullable(),
	workers: z.array(WorkerState),
	files: z.array(RunFile),
	repeats: z.array(RepeatStat),
	drift: z.array(Drift),
	milestones: RunMilestones.nullable().optional(),
	etaMs: z.number().nullable(),
	etaP90Ms: z.number().nullable(),
	resources: RunResources.nullable().optional(),
	sizing: RunSizing.nullable().optional(),
});

export const RunOutcome = z.enum(["all", "passed", "failed", "cancelled"]);
export const ListRunsQuery = z.object({
	status: z.enum(["live", "finished", "all"]).default("live"),
	outcome: RunOutcome.default("all"),
	purpose: z.enum(["adhoc", "baseline"]).optional(),
	baseline: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.optional(),
	branch: z.string().optional(),
	exactBranch: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const RunsPage = z.object({
	runs: z.array(RunSummary),
	nextCursor: z.string().nullable(),
	total: z.number(),
});

export const BRANCH_HISTORY_RUNS = 12;
export const ListBranchesQuery = z.object({
	branch: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const BranchesPage = z.object({
	branches: z.array(
		z.object({ branch: z.string(), runs: z.array(RunSummary) }),
	),
	nextCursor: z.string().nullable(),
});

export const RunStatsQuery = z.object({ since: z.string().datetime() });
export const RunStats = z.object({ runs: z.number(), usd: z.number() });

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
		type: z.literal("eta"),
		etaMs: z.number().nullable(),
		etaP90Ms: z.number().nullable(),
	}),
	z.object({
		type: z.literal("log"),
		file: z.string().nullable(),
		worker: z.string().nullable(),
		text: z.string(),
	}),
]);

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
export const ReinitScope = z.enum([
	"all",
	"missing_webhooks",
	"unhealthy",
	"selected",
]);
export const ReinitKeysBody = z.object({
	scope: ReinitScope.default("all"),
	platformAccountIds: z.array(z.string()).optional(),
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

export const StripeAccount = z.object({
	id: z.string(),
	platformAccountId: z.string(),
	state: z.enum(["clean", "in_use", "nuking", "broken"]),
	heldBy: z.string().nullable(),
	runId: z.string().nullable(),
	stateChangedAt: z.string(),
	brokenReason: z.string().nullable(),
});

export const RetryBrokenAccountsResponse = z.object({
	enqueued: z.number(),
	skipped: z.number(),
});

export const Job = z.object({
	id: z.string(),
	kind: z.enum(["warm", "swarm", "nuke", "reinit_keys", "full_nuke_key", "qa"]),
	singletonKey: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
	error: z.string().nullable(),
	attempts: z.number(),
	createdBy: ActorRef,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});
export const EnqueueResponse = z.object({ job: Job, deduped: z.boolean() });

export const QA_ENV_NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

export const CreateQaEnvBody = z.object({
	ref: z.string().min(1),
	name: z.string().regex(QA_ENV_NAME).optional(),
	parentBranch: z.string().min(1),
	secrets: z.object({
		BETTER_AUTH_SECRET: z.string().min(1),
		ENCRYPTION_IV: z.string().min(1),
		ENCRYPTION_PASSWORD: z.string().min(1),
	}),
	supersedes: z.string().regex(QA_ENV_NAME).optional(),
	freshDb: z.boolean().optional(),
	tinybird: z.boolean().optional(),
});

export const QaBuild = z.object({
	phase: z.string().nullable(),
	elapsedMs: z.number(),
	remainingMs: z.number(),
	percent: z.number(),
});

export const QaEnv = z.object({
	name: z.string(),
	url: z.string(),
	ref: z.string(),
	sha: z.string(),
	state: z.enum(["building", "ready", "failed", "deleted"]),
	awake: z.boolean().nullable(),
	building: QaBuild.nullable(),
	error: z.string().nullable(),
	tinybirdUrl: z.string().nullable(),
	createdBy: z.string(),
	createdAt: z.string(),
	expiresAt: z.string(),
	lastActiveAt: z.string().nullable(),
	jobId: z.string().nullable(),
});

export const CreateQaEnvResponse = z.object({
	env: QaEnv,
	job: Job,
	deduped: z.boolean(),
});

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
	queuedRuns: z.number(),
	accountsWanted: z.number(),
	slotsAwaitingWarm: z.number(),
	poolCap: z.number(),
	maxFilesNow: z.number(),
	warmBuilds: z.number(),
});

export const ApiError = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		next: z.string(),
		escalate: z.string().nullable(),
		details: z.record(z.unknown()).optional(),
	}),
});

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
	z.object({ type: z.literal("keys.changed") }),
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
	z.object({
		type: z.literal("event"),
		topic: LiveTopic,
		seq: z.number(),
		event: LiveEvent,
	}),
	z.object({ type: z.literal("pong") }),
	z.object({ type: z.literal("error"), error: ApiError.shape.error }),
]);

export const CostRates = z.object({
	usdPerCoreSecond: z.number(),
	usdPerGibSecond: z.number(),
	regionMultiplier: z.number(),
	workerCores: z.number(),
	workerMemoryGib: z.number(),
});
export const CostsQuery = z.object({
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
	buckets: z.array(
		z.object({
			start: z.string(),
			usd: z.number(),
			warmUsd: z.number(),
			runs: z.number(),
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
	topRuns: z.array(RunSummary),
});

export const ROUTES = {
	health: "GET /health",

	authGoogleStart: "GET /auth/google",
	authGoogleCallback: "GET /auth/google/callback",
	authLogout: "POST /auth/logout",
	me: "GET /me",
	listApiKeys: "GET /api-keys",
	createApiKey: "POST /api-keys",
	revokeApiKey: "DELETE /api-keys/:id",

	catalog: "GET /catalog",
	branches: "GET /branches",
	refreshBranches: "POST /branches/refresh",
	warmBranch: "POST /branches/:branch/warm",

	listRuns: "GET /runs",
	runBranches: "GET /runs/branches",
	runStats: "GET /runs/stats?since=",
	createRun: "POST /runs",
	getRun: "GET /runs/:id",
	runEvents: "GET /runs/:id/events",
	fileLog: "GET /runs/:id/files/log?file=",
	runLogs: "GET /runs/:id/logs",
	failedLogs: "GET /runs/:id/logs/failed",
	cancelRun: "POST /runs/:id/cancel",
	rerunFailed: "POST /runs/:id/rerun-failed",

	keys: "GET /keys",
	probeKeys: "POST /keys/probe",
	reinitKeys: "POST /keys/reinit",
	importKeys: "POST /keys/import",
	removeKey: "DELETE /keys/:platformAccountId",
	fullNukeKey: "POST /keys/:platformAccountId/full-nuke",

	listAccounts: "GET /accounts",
	nukeAccounts: "POST /accounts/nuke",
	retryBrokenAccounts: "POST /accounts/retry-broken",
	forgetAccount: "DELETE /accounts/:id",

	listJobs: "GET /jobs",
	getJob: "GET /jobs/:id",
	cancelJob: "POST /jobs/:id/cancel",

	baselines: "GET /baselines",
	costs: "GET /costs",
	fileHistory: "GET /files/history?file=",
	devStatus: "POST /files/dev-status",
	ingestResults: "POST /results/ingest",

	capacity: "GET /capacity",
	mcp: "POST /mcp",
	live: "GET /ws (WebSocket; cookie, Authorization: Bearer, or ?token=twd_…)",

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
export type BranchesPage = z.infer<typeof BranchesPage>;
export type RunStats = z.infer<typeof RunStats>;
export type RunLive = z.infer<typeof RunLive>;
export type RunDetail = z.infer<typeof RunDetail>;
export type RunSizing = z.infer<typeof RunSizing>;
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
export type RetryBrokenAccountsResponse = z.infer<
	typeof RetryBrokenAccountsResponse
>;
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
export type CreateQaEnvBody = z.infer<typeof CreateQaEnvBody>;
export type QaEnv = z.infer<typeof QaEnv>;
export type CreateQaEnvResponse = z.infer<typeof CreateQaEnvResponse>;
