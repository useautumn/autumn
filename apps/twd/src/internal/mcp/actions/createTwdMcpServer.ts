import { z } from "zod/v4";
import type { RunDetail } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCapacity } from "../../capacity/actions/getCapacity.ts";
import { listCatalog } from "../../catalog/actions/listCatalog.ts";
import { warmBranch } from "../../catalog/actions/warmBranch.ts";
import { cancelRun } from "../../runs/actions/cancelRun.ts";
import { createRun } from "../../runs/actions/createRun.ts";
import { getRun } from "../../runs/actions/getRun.ts";
import { toolOk } from "./toolResult.ts";
import { defineTool, serveTools } from "./toolServer.ts";

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const WAIT_POLL_MS = 5_000;
const WAIT_MAX_S = 600;

/** Agent-sized run view: counts, failures and drift only (never the full file list). */
const summariseRun = (run: RunDetail) => {
	const failures = run.files
		.filter((f) => f.status === "failed" || f.status === "crashed")
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
	const workers = `workers ${run.workerCount ?? 0}/${run.workersWanted ?? "?"}`;
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
		terminal: TERMINAL.has(run.status),
		workers: { current: run.workerCount, wanted: run.workersWanted },
		queuePosition: run.queuePosition,
		cost: run.cost,
		files: {
			total: run.fileCount,
			done,
			passed: run.passed,
			failed: run.failed,
		},
		failures,
		drift: run.drift,
		startedAt: run.startedAt,
		finishedAt: run.finishedAt,
	};
	const summary = `Run ${run.id} on ${run.branch}@${run.sha.slice(0, 12)} is ${run.status}${run.phase ? ` (${run.phase})` : ""}${queue}; ${workers}: ${run.passed} passed, ${run.failed} failed, ${done}/${run.fileCount ?? "?"} files done, ${run.drift.length} drift flag(s).`;
	return { summary, data };
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
				})
				.strict(),
			run: async ({ branch, sha, groups, files, grep }) => {
				const run = await createRun({
					ctx,
					branch,
					sha,
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
				"Non-blocking snapshot of a run: status, phase, workers attached vs wanted, queue position while waiting for its first account, cost, pass/fail counts, failing files with failure summaries, and drift (new_failure = fails here but passes on dev; slow = >1.5x dev p90). Use wait_for_run to block until it finishes.",
			input: z.object({ run_id: z.string().min(1) }),
			run: async ({ run_id }) =>
				toolOk(summariseRun(await getRun({ ctx, runId: run_id }))),
		}),
		defineTool({
			name: "wait_for_run",
			description:
				"Step 3 of 'test my branch'. Blocks until the run finishes (passed|failed|cancelled|errored) or timeout_s elapses (default and max 600), then returns the same shape as get_run (including workers X/Y and queue position). If terminal is false, call it again; a queued run is waiting for its first free account and starts on its own. On finish, read failures and drift: a new_failure is most likely caused by your branch; files failing without drift may be flaky on dev too.",
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
	]);
