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

export const CreateRunBody = z.object({
	branch: z.string().min(1),
	/** Defaults to the branch head. */
	sha: z.string().optional(),
	selection: RunSelection,
	/** Optional pinned accounts from a reservation. */
	reservationId: z.string().optional(),
	purpose: z.enum(["adhoc", "baseline"]).default("adhoc"),
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
});

export const RunSummary = z.object({
	id: z.string(),
	branch: z.string(),
	sha: z.string(),
	status: RunStatus,
	purpose: z.enum(["adhoc", "baseline"]),
	selection: RunSelection,
	fileCount: z.number().nullable(),
	workerCount: z.number().nullable(),
	passed: z.number(),
	failed: z.number(),
	createdBy: ActorRef,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});

export const RunDetail = RunSummary.extend({
	phase: z.string().nullable(),
	workers: z.array(WorkerState),
	files: z.array(RunFile),
	drift: z.array(Drift),
});

export const ListRunsQuery = z.object({
	status: z.enum(["live", "finished", "all"]).default("live"),
	branch: z.string().optional(),
	limit: z.coerce.number().max(200).default(50),
});

/** SSE event on GET /runs/:id/events. */
export const RunEvent = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("status"),
		status: RunStatus,
		phase: z.string().nullable(),
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
		reserved: z.number(),
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
export const KeysOverview = z.object({
	gate: KeyGate,
	keys: z.array(StripeKey),
});

// ---- accounts + reservations ---------------------------------------------

export const StripeAccount = z.object({
	id: z.string(),
	platformAccountId: z.string(),
	state: z.enum(["clean", "reserved", "in_use", "nuking", "broken"]),
	heldBy: z.string().nullable(),
	runId: z.string().nullable(),
	reservationId: z.string().nullable(),
	reservedUntil: z.string().nullable(),
	stateChangedAt: z.string(),
});
export const CreateReservationBody = z.object({
	count: z.number().int().min(1).max(2000),
	/** e.g. "2h", "30m". Max 24h. */
	ttl: z.string().default("2h"),
	note: z.string().optional(),
});
export const Reservation = z.object({
	id: z.string(),
	owner: ActorRef,
	note: z.string().nullable(),
	accountIds: z.array(z.string()),
	expiresAt: z.string(),
	releasedAt: z.string().nullable(),
	createdAt: z.string(),
});

// ---- jobs -----------------------------------------------------------------

export const Job = z.object({
	id: z.string(),
	kind: z.enum(["warm", "swarm", "nuke", "reinit_keys"]),
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
		reserved: z.number(),
		inUse: z.number(),
		nuking: z.number(),
		broken: z.number(),
	}),
	liveRuns: z.number(),
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
	warmBranch: "POST /branches/:branch/warm",

	// runs (http/routes/runs.ts)
	listRuns: "GET /runs",
	createRun: "POST /runs",
	getRun: "GET /runs/:id",
	runEvents: "GET /runs/:id/events",
	fileLog: "GET /runs/:id/files/log?file=",
	cancelRun: "POST /runs/:id/cancel",
	rerunFailed: "POST /runs/:id/rerun-failed",

	// keys (http/routes/keys.ts)
	keys: "GET /keys",
	probeKeys: "POST /keys/probe",
	reinitKeys: "POST /keys/reinit",

	// accounts (http/routes/accounts.ts)
	listAccounts: "GET /accounts",
	listReservations: "GET /reservations",
	createReservation: "POST /reservations",
	releaseReservation: "DELETE /reservations/:id",
	nukeAccounts: "POST /accounts/nuke",

	// jobs (http/routes/jobs.ts)
	listJobs: "GET /jobs",
	getJob: "GET /jobs/:id",
	cancelJob: "POST /jobs/:id/cancel",

	// results (http/routes/results.ts)
	baselines: "GET /baselines",
	fileHistory: "GET /files/history?file=",

	// capacity + MCP (http/routes/capacity.ts, http/routes/mcp.ts)
	capacity: "GET /capacity",
	mcp: "POST /mcp",

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
export type RunDetail = z.infer<typeof RunDetail>;
export type RunFile = z.infer<typeof RunFile>;
export type RunEvent = z.infer<typeof RunEvent>;
export type WorkerState = z.infer<typeof WorkerState>;
export type Drift = z.infer<typeof Drift>;
export type StripeKey = z.infer<typeof StripeKey>;
export type KeysOverview = z.infer<typeof KeysOverview>;
export type StripeAccount = z.infer<typeof StripeAccount>;
export type Reservation = z.infer<typeof Reservation>;
export type Capacity = z.infer<typeof Capacity>;
export type ApiError = z.infer<typeof ApiError>;
export type Job = z.infer<typeof Job>;
export type EnqueueResponse = z.infer<typeof EnqueueResponse>;
