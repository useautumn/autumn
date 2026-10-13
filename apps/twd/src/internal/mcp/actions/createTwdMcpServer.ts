import { z } from "zod/v4";
import {
	isFailedFileStatus,
	MAX_FILES_PER_WORKER,
	MAX_REPEAT,
	type RunDetail,
} from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCapacity } from "../../capacity/actions/getCapacity.ts";
import { listCatalog } from "../../catalog/actions/listCatalog.ts";
import { warmBranch } from "../../catalog/actions/warmBranch.ts";
import { qaTools } from "../../qa/mcp/qaTools.ts";
import { getDevStatus } from "../../results/actions/getDevStatus.ts";
import { getFileHistory } from "../../results/actions/queryResults.ts";
import type { FileDevStatus } from "../../results/types/resultsSchemas.ts";
import { cancelRun } from "../../runs/actions/cancelRun.ts";
import { createRun } from "../../runs/actions/createRun.ts";
import { getRun } from "../../runs/actions/getRun.ts";
import { summariseBoot } from "../../runs/boot/summariseBoot.ts";
import { getFailedLogs, getRunLogs } from "../../runs/logs/getRunLogs.ts";
import { MAX_REPEAT_WORK_ITEMS } from "../../runs/repeat/repetitions.ts";
import { summariseRunTiming } from "../../runs/timing/summariseRunTiming.ts";
import { toolOk } from "./toolResult.ts";
import { defineTool, serveTools } from "./toolServer.ts";

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const WAIT_POLL_MS = 5_000;
const WAIT_MAX_S = 600;
const REPEATS_IN_SUMMARY = 5;

const describeRepeats = (run: RunDetail) => {
	if (run.repeats.length === 0) return "";
	const shown = run.repeats
		.slice(0, REPEATS_IN_SUMMARY)
		.map(
			(r) =>
				`${r.file} passed ${r.firstAttemptPassed}/${r.total} on first attempt${r.passedOnRetry ? ` (+${r.passedOnRetry} on retry)` : ""}${r.done < r.total ? `, ${r.done}/${r.total} done` : ""}`,
		);
	const more = run.repeats.length - shown.length;
	return ` Repeat ×${run.repeat}: ${shown.join("; ")}${more > 0 ? `; ${more} more file(s) in data.repeats` : ""}.`;
};

/** Agent-sized run view: counts, failures and drift only (never the full file list). */
const summariseRun = (run: RunDetail) => {
	const failures = run.files
		.filter((f) => isFailedFileStatus(f.status))
		.map((f) => ({
			file: f.file,
			status: f.status,
			attempt: f.attempt,
			failedTests: f.failedTests,
			failureSummary: f.failureSummary,
		}));
	const done = run.files.filter(
		(f) => f.status !== "queued" && f.status !== "running",
	).length;
	const timedOut = failures.filter((f) => f.status === "timed_out").length;
	const terminal = TERMINAL.has(run.status);
	const workers = `${terminal ? "peak workers" : "workers"} ${run.workerCount ?? 0}/${run.workersWanted ?? "?"}`;
	const queue =
		run.queuePosition === null
			? ""
			: `, #${run.queuePosition} in the account queue (starts as soon as one account is free)`;
	const data = {
		id: run.id,
		branch: run.branch,
		sha: run.sha,
		status: run.status,
		phase: run.phase,
		terminal,
		repeat: run.repeat,
		repeats: run.repeats,
		workers: terminal
			? { peak: run.workerCount, wanted: run.workersWanted }
			: { current: run.workerCount, wanted: run.workersWanted },
		queuePosition: run.queuePosition,
		boot: summariseBoot(run.workers),
		timing: (({ completion: _, ...timing }) => timing)(summariseRunTiming(run)),
		cost: run.cost,
		files: {
			total: run.fileCount,
			done,
			passed: run.passed,
			failed: run.failed,
			timedOut,
		},
		failures,
		drift: run.drift,
		eta: { etaMs: run.etaMs, etaP90Ms: run.etaP90Ms },
		resources: run.resources ?? null,
		sizing: run.sizing ?? null,
		startedAt: run.startedAt,
		finishedAt: run.finishedAt,
	};
	const summary = `Run ${run.id} on ${run.branch}@${run.sha.slice(0, 12)} is ${run.status}${run.phase ? ` (${run.phase})` : ""}${queue}; ${workers}: ${run.passed} passed, ${run.failed} failed${timedOut ? ` (${timedOut} timed out)` : ""}, ${done}/${run.fileCount ?? "?"} files done, ${run.drift.length} drift flag(s).${run.etaMs === null ? "" : ` About ${Math.ceil(run.etaMs / 60_000)} min left (p90 ${Math.ceil((run.etaP90Ms ?? run.etaMs) / 60_000)} min).`}${describeRepeats(run)}`;
	return { summary, data };
};

const describeDevStatus = (f: FileDevStatus) => {
	if (f.status === "no_data")
		return `${f.file}: NO DATA on dev, not a pass. ${f.reason}`;
	const rate = `pass rate ${Math.round((f.passRate ?? 0) * 100)}% over ${f.samples}`;
	const latest = f.latest
		? `latest ${f.latest.status} at dev ${f.latest.sha.slice(0, 12)} (${f.latest.source}, ${f.latest.at})`
		: "";
	const verdict = {
		passed: "passes on dev",
		failing: "FAILS on dev too",
		flaky: "FLAKY on dev",
	}[f.status];
	return `${f.file}: ${verdict} (${rate}; ${latest})`;
};

/** A fresh MCP server per request (stateless); every tool calls the same actions as REST. */
export const createTwdMcpServer = ({ ctx }: { ctx: TwdContext }) =>
	serveTools([
		defineTool({
			name: "get_capacity",
			description:
				"See how busy the test pool is. Returns the key gate (open|draining), usable Stripe keys, account counts by state, live and queued runs, accountsWanted (accounts live runs still want), poolCap, and maxFilesNow (workers a new run would get immediately). You never need to wait before start_run: runs queue FIFO, start as soon as one account is free, and grow as more free up. Only a draining gate blocks new runs.",
			input: z.object({}),
			run: async () => {
				const capacity = await getCapacity({ ctx });
				return toolOk({
					summary: `Gate ${capacity.gate}; ${capacity.accounts.clean} clean accounts (pool cap ${capacity.poolCap}); ${capacity.liveRuns} live run(s), ${capacity.queuedRuns} queued, ${capacity.accountsWanted} account(s) still wanted; a new run would start with ${capacity.maxFilesNow} worker(s) now${capacity.maxFilesNow === 0 ? " and wait its turn in the FIFO queue" : ""}.`,
					data: capacity,
				});
			},
		}),
		defineTool({
			name: "list_catalog",
			description:
				"List test groups (name, tier, fileCount) and, optionally, test files with their dev baseline p90. Use it to pick `groups` or `files` for start_run. Set include_files=true only when you need exact paths, and narrow with path_contains to keep the result small.",
			input: z.object({
				include_files: z
					.boolean()
					.optional()
					.describe("Include individual test files (default false)."),
				path_contains: z
					.string()
					.optional()
					.describe("Only return files whose path contains this substring."),
			}),
			run: async ({ include_files, path_contains }) => {
				const catalog = await listCatalog({ ctx });
				const files = include_files
					? catalog.files.filter(
							(f) => !path_contains || f.path.includes(path_contains),
						)
					: [];
				return toolOk({
					summary: `${catalog.groups.length} groups, ${catalog.files.length} files${include_files ? ` (${files.length} returned)` : ""}.`,
					data: { groups: catalog.groups, files },
				});
			},
		}),
		defineTool({
			name: "warm_branch",
			description:
				"Step 1 of 'test my branch'. Builds the warm Modal image for a pushed branch's head commit (no PR needed). Idempotent: a second call attaches to the live build. You do not need to wait for it; start_run uses or awaits the warm image. The branch must be pushed to GitHub first.",
			input: z.object({
				branch: z.string().min(1).describe("Git branch name, e.g. 'feat/foo'."),
			}),
			run: async ({ branch }) => {
				const { job, deduped } = await warmBranch({ ctx, branch });
				return toolOk({
					summary: `Warm job ${job.id} for ${branch} is ${job.status}${deduped ? " (attached to an existing build)" : ""}. Next: start_run.`,
					data: { job, deduped },
				});
			},
		}),
		defineTool({
			name: "start_run",
			description:
				"Step 2 of 'test my branch'. Starts a test run on Modal for a pushed branch and returns its run id immediately. Select tests with groups (names from list_catalog), files (exact paths), and/or grep (test-name pattern); at least one is required. Accounts are allocated automatically, FIFO: the run starts as soon as one account is free and grows as more free up, so never pre-check capacity. Next: wait_for_run with the returned id.",
			input: z
				.object({
					branch: z.string().min(1).describe("Pushed git branch."),
					sha: z
						.string()
						.optional()
						.describe("Commit to test; defaults to the branch head."),
					groups: z
						.array(z.string())
						.optional()
						.describe("Group names from list_catalog, e.g. ['core']."),
					files: z
						.array(z.string())
						.optional()
						.describe("Exact test file paths from list_catalog."),
					grep: z
						.string()
						.optional()
						.describe("Only run tests whose name matches this pattern."),
					max_workers: z
						.number()
						.int()
						.min(1)
						.max(5_000)
						.optional()
						.describe(
							"Cap on workers, one file each. Exclusive with max_files_per_worker; leave both unset for Auto (the default).",
						),
					max_files_per_worker: z
						.number()
						.int()
						.min(1)
						.max(MAX_FILES_PER_WORKER)
						.optional()
						.describe(
							"Files each worker runs at once (org-mutating and learned-solo files still run alone). Exclusive with max_workers; leave both unset for Auto, which picks files per worker and worker count from measured per-file Stripe/CPU/memory profiles. Not with repeat > 1.",
						),
					repeat: z
						.number()
						.int()
						.min(1)
						.max(MAX_REPEAT)
						.optional()
						.describe(
							`ONLY to confirm or measure a flaky test (e.g. prove a flake fix with repeat=10): runs each selected file N times, each on its own work item, and reports first-attempt passes X/N per file. Default 1. Never use it for normal runs; it multiplies cost. Max ${MAX_REPEAT}, and files × repeat ≤ ${MAX_REPEAT_WORK_ITEMS}.`,
						),
				})
				.strict(),
			run: async ({
				branch,
				sha,
				groups,
				files,
				grep,
				max_workers,
				max_files_per_worker,
				repeat,
			}) => {
				const run = await createRun({
					ctx,
					branch,
					sha,
					maxWorkers: max_workers,
					maxFilesPerWorker: max_files_per_worker,
					repeat,
					selection: { groups, files, grep },
					purpose: "adhoc",
				});
				return toolOk({
					summary: `Started run ${run.id} on ${run.branch}@${run.sha.slice(0, 12)} (${run.status}${run.queuePosition === null ? "" : `, #${run.queuePosition} in the account queue`}). It starts as soon as one account is free and grows from there. Next: wait_for_run with run_id=${run.id}.`,
					data: run,
				});
			},
		}),
		defineTool({
			name: "get_run",
			description:
				"Non-blocking snapshot of a run: status, phase, workers attached vs wanted (once finished: peak attached at once vs wanted), boot (per-step p50/p90/max ms from account to serving, and the slowest workers), timing (wall-time phases: warm image, waiting for accounts, first worker boot, tests, teardown; ms marks from creation; duration histogram; slowest files), queue position while waiting for its first account, eta (etaMs/etaP90Ms: estimated remaining wall time, null until ~5 files finish), cost, pass/fail counts (failed includes timedOut), failing files with status failed|crashed|timed_out and failure summaries, drift (new_failure = fails here but passes on dev; slow = >1.5x dev p90), sizing (how Auto or the caller's cap chose files per worker and worker count: mode, filesPerWorker, workers, packed/solo files, target vs predicted wall, per-worker limits and expected load, the binding resource, and reasons), and resources (per-file stats totals: Stripe requests, 429s, permit-wait p95/max, worker peak rps/in-flight, CPU core-seconds and p95 peak cores, p95/max peak memory; null until files report). For a repeat run, repeats gives each file's first-attempt pass rate (firstAttemptPassed/total) and failures name repetitions as <file>#<k>; drift is not computed. Use wait_for_run to block until it finishes.",
			input: z.object({ run_id: z.string().min(1) }),
			run: async ({ run_id }) =>
				toolOk(summariseRun(await getRun({ ctx, runId: run_id }))),
		}),
		defineTool({
			name: "wait_for_run",
			description:
				"Step 3 of 'test my branch'. Blocks until the run finishes (passed|failed|cancelled|errored) or timeout_s elapses (default and max 600), then returns the same shape as get_run (including workers X/Y and queue position). If terminal is false, call it again; a queued run is waiting for its first free account and starts on its own. On finish, read failures and drift: a new_failure is most likely caused by your branch; for files failing without drift, call dev_status before calling them pre-existing.",
			input: z.object({
				run_id: z.string().min(1),
				timeout_s: z
					.number()
					.int()
					.min(1)
					.max(WAIT_MAX_S)
					.optional()
					.describe("Seconds to wait (default and max 600)."),
			}),
			run: async ({ run_id, timeout_s }, extra) => {
				const deadline = Date.now() + (timeout_s ?? WAIT_MAX_S) * 1000;
				const progressToken = extra._meta?.progressToken;
				let run = await getRun({ ctx, runId: run_id });
				while (
					!TERMINAL.has(run.status) &&
					Date.now() < deadline &&
					!extra.signal.aborted
				) {
					if (progressToken !== undefined) {
						await extra.sendNotification({
							method: "notifications/progress",
							params: {
								progressToken,
								progress: run.passed + run.failed,
								total: run.fileCount ?? undefined,
								message: `${run.status}${run.phase ? ` (${run.phase})` : ""}; workers ${run.workerCount ?? 0}/${run.workersWanted ?? "?"}${run.queuePosition === null ? "" : `; #${run.queuePosition} in queue`}`,
							},
						});
					}
					await Bun.sleep(Math.min(WAIT_POLL_MS, deadline - Date.now()));
					run = await getRun({ ctx, runId: run_id });
				}
				const { summary, data } = summariseRun(run);
				return toolOk({
					summary: data.terminal
						? summary
						: `${summary} Still in progress; call wait_for_run again.`,
					data,
				});
			},
		}),
		defineTool({
			name: "get_run_logs",
			description:
				"Read a run's raw output as text. Use failed_only=true after wait_for_run reports failures: it returns every failed file's log under a header. Or pass file (server/tests-relative path) or worker for one slice; in a repeat run also pass repetition (1..N), or pass the <file>#<k> id from failures. Long logs are truncated to max_chars from the end.",
			input: z.object({
				run_id: z.string().min(1),
				failed_only: z.boolean().optional(),
				file: z.string().optional(),
				repetition: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Repeat runs only: which repetition of file (1-based)."),
				worker: z.string().optional(),
				run_only: z
					.boolean()
					.optional()
					.describe(
						"Only the orchestrator's own lines (phases, [twd-progress] counters), no worker or file output.",
					),
				max_chars: z.number().int().min(1_000).max(500_000).optional(),
			}),
			run: async ({
				run_id,
				failed_only,
				file,
				repetition,
				worker,
				run_only,
				max_chars,
			}) => {
				const text = failed_only
					? await getFailedLogs({ ctx, runId: run_id })
					: await getRunLogs({
							ctx,
							runId: run_id,
							file,
							repetition,
							worker,
							scope: run_only ? "run" : undefined,
						});
				const limit = max_chars ?? 60_000;
				const clipped =
					text.length > limit
						? `…(${text.length - limit} earlier chars omitted)\n${text.slice(-limit)}`
						: text;
				return toolOk({
					summary: `${text.length} chars of ${failed_only ? "failed-file" : file ? "file" : worker ? "worker" : "run"} logs for ${run_id}.`,
					data: { text: clipped },
				});
			},
		}),
		defineTool({
			name: "dev_status",
			description:
				"Is this test failure already on dev? Call it before calling any failure pre-existing or running a test on dev to find out. For each file returns status passed | failing | flaky | no_data on dev, judged by the final attempt of its latest `limit` (default 10) dev results from twd runs (source swarm) and dev CI uploads (source ci, how unit tests arrive), with passRate, the latest result (status, dev sha, source, time) and the recent results newest first. failing = the latest two dev results failed; flaky = mixed or passing only on retry; no_data says why and is never a pass. files take server/tests-relative paths (unit/…, integration/…); server/tests/ prefixes are stripped.",
			input: z.object({
				files: z.array(z.string().min(1)).min(1).max(100),
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.optional()
					.describe("Latest dev results to judge by, per file (default 10)."),
			}),
			run: async ({ files, limit }) => {
				const statuses = await getDevStatus({ ctx, files, limit: limit ?? 10 });
				return toolOk({
					summary: statuses.map(describeDevStatus).join("\n"),
					data: statuses,
				});
			},
		}),
		defineTool({
			name: "get_file_history",
			description:
				"How one test file's speed and stability changed over time, keyed by file path with commit metadata. Returns byCommit (oldest first: sha, branch, runs, p50Ms, maxMs, passRate), the dev baseline (p50/p90), and raw recent results (newest first; status passed|failed|crashed|timed_out|skipped, where timed_out means the file hit bun's per-test timeout; source swarm = a twd run, ci = a CI upload such as dev unit tests). Use it to spot a commit that made a file slower or flaky. file is server/tests-relative, as list_catalog shows it.",
			input: z.object({
				file: z.string().min(1),
				branch: z.string().optional(),
				limit: z.number().int().min(1).max(500).optional(),
			}),
			run: async ({ file, branch, limit }) => {
				const history = await getFileHistory({ ctx, file, branch, limit });
				return toolOk({
					summary: `${history.results.length} result(s) across ${history.byCommit.length} commit(s) for ${file}${branch ? ` on ${branch}` : ""}.`,
					data: history,
				});
			},
		}),
		defineTool({
			name: "cancel_run",
			description:
				"Cancel a queued or running run. Workers stop and accounts are cleaned up asynchronously. Use when you started the wrong selection or no longer need the result.",
			input: z.object({ run_id: z.string().min(1) }),
			run: async ({ run_id }) => {
				const run = await cancelRun({ ctx, runId: run_id });
				return toolOk({
					summary: `Run ${run.id} is ${run.status}.`,
					data: run,
				});
			},
		}),
		...qaTools({ ctx }),
	]);
