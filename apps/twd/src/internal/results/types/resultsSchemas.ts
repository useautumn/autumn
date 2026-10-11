import { z } from "zod";

const ResultSourceEnum = z.enum(["swarm", "ci"]);

/** Response shapes for GET /baselines and GET /files/history (not yet in api/contract.ts). */
export const FileBaseline = z.object({
	file: z.string(),
	p50Ms: z.number(),
	p90Ms: z.number(),
	passRate: z.number(),
	samples: z.number(),
	/** ci = from dev CI uploads (timings are not sandbox timings). */
	source: ResultSourceEnum,
	updatedAt: z.string(),
});

export const ListBaselinesQuery = z.object({
	sort: z
		.enum(["file", "p50Ms", "p90Ms", "passRate", "samples"])
		.default("p90Ms"),
	order: z.enum(["asc", "desc"]).default("desc"),
	limit: z.coerce.number().int().min(1).max(5000).default(2000),
});

export const FileHistoryQuery = z.object({
	file: z.string().min(1),
	branch: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const FileHistoryEntry = z.object({
	runId: z.string(),
	branch: z.string(),
	sha: z.string(),
	status: z.enum(["passed", "failed", "crashed", "timed_out", "skipped"]),
	durationMs: z.number(),
	attempt: z.number(),
	/** Set when the result is one repetition of a repeat run. */
	repetition: z.number().nullable(),
	passedTests: z.number(),
	failedTests: z.number(),
	worker: z.string().nullable(),
	failureSummary: z.string().nullable(),
	/** swarm = a twd run; ci = uploaded by CI. */
	source: ResultSourceEnum,
	createdAt: z.string(),
});

/** One commit's runs of the file: how its speed and stability looked at that sha. */
export const FileCommitSummary = z.object({
	sha: z.string(),
	branch: z.string(),
	runs: z.number(),
	p50Ms: z.number(),
	maxMs: z.number(),
	passRate: z.number(),
	firstAt: z.string(),
	lastAt: z.string(),
});

export const FileHistory = z.object({
	file: z.string(),
	baseline: FileBaseline.nullable(),
	/** Newest first. */
	results: z.array(FileHistoryEntry),
	/** Oldest commit first, so it reads as speed over time. */
	byCommit: z.array(FileCommitSummary),
});

export type FileBaseline = z.infer<typeof FileBaseline>;
export type FileHistory = z.infer<typeof FileHistory>;

const FILE_STATUSES = [
	"passed",
	"failed",
	"crashed",
	"timed_out",
	"skipped",
] as const;

export const MAX_INGEST_RESULTS = 5_000;

/** POST /results/ingest: per-file results a CI job ran outside twd. */
export const IngestResultsBody = z.object({
	source: z.literal("ci"),
	branch: z.string().min(1),
	sha: z.string().regex(/^[0-9a-f]{40}$/, "sha must be a full 40-char hex sha"),
	/** Stable id of the CI run attempt, e.g. gh-<run_id>-<attempt>; re-posting it replaces its rows. */
	ciRunId: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
	results: z
		.array(
			z.object({
				file: z.string().min(1),
				status: z.enum(FILE_STATUSES),
				durationMs: z.number().min(0),
				attempt: z.number().int().min(1).default(1),
				passedTests: z.number().int().min(0).default(0),
				failedTests: z.number().int().min(0).default(0),
				failureSummary: z.string().max(4_000).nullable().default(null),
			}),
		)
		.min(1)
		.max(MAX_INGEST_RESULTS),
});

export const IngestResultsResponse = z.object({
	runId: z.string(),
	inserted: z.number(),
	baselinesRefreshed: z.boolean(),
});

export const MAX_DEV_STATUS_FILES = 100;

export const DevStatusBody = z.object({
	files: z.array(z.string().min(1)).min(1).max(MAX_DEV_STATUS_FILES),
	/** Latest dev results to judge by, per file. */
	limit: z.number().int().min(1).max(50).default(10),
});

export const DevResult = z.object({
	status: z.enum(FILE_STATUSES),
	sha: z.string(),
	source: ResultSourceEnum,
	runId: z.string(),
	attempt: z.number(),
	at: z.string(),
});

export const FileDevStatus = z.object({
	file: z.string(),
	status: z.enum(["passed", "failing", "flaky", "no_data"]),
	/** Why there is no verdict; set only for no_data. */
	reason: z.string().nullable(),
	/** Final-attempt passes over non-skipped results; null for no_data. */
	passRate: z.number().nullable(),
	samples: z.number(),
	latest: DevResult.nullable(),
	/** Newest first. */
	recent: z.array(DevResult),
});

export type IngestResultsBody = z.infer<typeof IngestResultsBody>;
export type IngestResultsResponse = z.infer<typeof IngestResultsResponse>;
export type DevResult = z.infer<typeof DevResult>;
export type FileDevStatus = z.infer<typeof FileDevStatus>;
