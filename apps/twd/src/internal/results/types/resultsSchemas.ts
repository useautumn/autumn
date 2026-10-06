import { z } from "zod";

/** Response shapes for GET /baselines and GET /files/history (not yet in api/contract.ts). */
export const FileBaseline = z.object({
	file: z.string(),
	p50Ms: z.number(),
	p90Ms: z.number(),
	passRate: z.number(),
	samples: z.number(),
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
