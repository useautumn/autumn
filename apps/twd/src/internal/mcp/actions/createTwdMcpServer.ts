import { z } from "zod/v4";
import type { RunDetail } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	createReservation,
	releaseReservation,
} from "../../accounts/actions/reservations.ts";
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
	const data = {
		id: run.id,
		branch: run.branch,
		sha: run.sha,
		status: run.status,
		phase: run.phase,
		terminal: TERMINAL.has(run.status),
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
	const summary = `Run ${run.id} on ${run.branch}@${run.sha.slice(0, 12)} is ${run.status}${run.phase ? ` (${run.phase})` : ""}: ${run.passed} passed, ${run.failed} failed, ${done}/${run.fileCount ?? "?"} files done, ${run.drift.length} drift flag(s).`;
	return { summary, data };
};

/** A fresh MCP server per request (stateless); every tool calls the same actions as REST. */
export const createTwdMcpServer = ({ ctx }: { ctx: TwdContext }) =>
	serveTools([
		defineTool({
			name: "get_capacity",
			description:
				"Check whether a test run can start now. Returns the key gate (open|draining), usable Stripe keys, account counts by state, live runs, and maxFilesNow (largest run that starts without waiting). Call before start_run for big selections; if gate is draining or maxFilesNow is 0, wait or narrow the selection.",
			input: z.object({}),
			run: async () => {
				const capacity = await getCapacity({ ctx });
				return toolOk({
					summary: `Gate ${capacity.gate}; ${capacity.accounts.clean} clean accounts; ${capacity.liveRuns} live run(s); up to ${capacity.maxFilesNow} files can start now.`,
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
				"Step 2 of 'test my branch'. Starts a test run on Modal for a pushed branch and returns its run id immediately. Select tests with groups (names from list_catalog), files (exact paths), and/or grep (test-name pattern); at least one is required. Next: wait_for_run with the returned id.",
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
					reservation_id: z
						.string()
						.optional()
						.describe("Run on accounts pinned by reserve_accounts."),
				})
				.strict(),
			run: async ({ branch, sha, groups, files, grep, reservation_id }) => {
				const run = await createRun({
					ctx,
					branch,
					sha,
					selection: { groups, files, grep },
					reservationId: reservation_id,
					purpose: "adhoc",
				});
				return toolOk({
					summary: `Started run ${run.id} on ${run.branch}@${run.sha.slice(0, 12)} (${run.status}). Next: wait_for_run with run_id=${run.id}.`,
					data: run,
				});
			},
		}),
		defineTool({
			name: "get_run",
			description:
				"Non-blocking snapshot of a run: status, phase, pass/fail counts, failing files with failure summaries, and drift (new_failure = fails here but passes on dev; slow = >1.5x dev p90). Use wait_for_run to block until it finishes.",
			input: z.object({ run_id: z.string().min(1) }),
			run: async ({ run_id }) =>
				toolOk(summariseRun(await getRun({ ctx, runId: run_id }))),
		}),
		defineTool({
			name: "wait_for_run",
			description:
				"Step 3 of 'test my branch'. Blocks until the run finishes (passed|failed|cancelled|errored) or timeout_s elapses (default and max 600), then returns the same shape as get_run. If terminal is false, call it again. On finish, read failures and drift: a new_failure is most likely caused by your branch; files failing without drift may be flaky on dev too.",
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
								message: `${run.status}${run.phase ? ` (${run.phase})` : ""}`,
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
		defineTool({
			name: "reserve_accounts",
			description:
				"Pin clean Stripe test accounts for your exclusive use (e.g. several runs in a row). Pass the returned reservation id as reservation_id to start_run. Always call release_reservation when finished; reservations also expire after ttl.",
			input: z.object({
				count: z.number().int().min(1).max(2000),
				ttl: z
					.string()
					.optional()
					.describe("Duration like '30m' or '2h' (default 2h, max 24h)."),
				note: z.string().optional().describe("Why you are reserving."),
			}),
			run: async ({ count, ttl, note }) => {
				const reservation = await createReservation({
					ctx,
					count,
					ttl: ttl ?? "2h",
					note,
				});
				return toolOk({
					summary: `Reserved ${reservation.accountIds.length} account(s) as ${reservation.id} until ${reservation.expiresAt}. Pass reservation_id=${reservation.id} to start_run.`,
					data: reservation,
				});
			},
		}),
		defineTool({
			name: "release_reservation",
			description:
				"Release accounts pinned by reserve_accounts so others can use them. Safe to call more than once.",
			input: z.object({ reservation_id: z.string().min(1) }),
			run: async ({ reservation_id }) => {
				const reservation = await releaseReservation({
					ctx,
					reservationId: reservation_id,
				});
				return toolOk({
					summary: `Released reservation ${reservation.id}.`,
					data: reservation,
				});
			},
		}),
	]);
