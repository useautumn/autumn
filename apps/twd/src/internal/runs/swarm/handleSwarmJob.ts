import { resolve } from "node:path";
import { and, count, eq } from "drizzle-orm";
import type { RunEvent } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { RunStatus } from "../../../db/schema/runs.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	type ClaimedAccount,
	claimAccountsForRun,
	releaseRunAccounts,
} from "../../accounts/actions/accountLedger.ts";
import { toAbsoluteTestPath } from "../../catalog/repoPaths.ts";
import { deleteIngressRoute } from "../../ingress/actions/ingressRoutes.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { onRunFinished } from "../../results/actions/refreshBaselines.ts";
import {
	orderFilesLongestFirst,
	recordFileResult,
} from "../../results/actions/resultsApi.ts";
import {
	openLiveRun,
	publishRunEvent,
	retireLiveRun,
} from "../live/liveRuns.ts";
import { terminateSandboxes } from "../modal/modalClient.ts";
import {
	getRunWithEmail,
	isTerminalRunStatus,
	type RunRow,
	updateRun,
} from "../repos/runsRepo.ts";
import { getWarmImage, isWarmImageFresh } from "../repos/warmImagesRepo.ts";
import { spawnTwChild } from "../spawnTwChild.ts";
import { type RunProgress, readRunProgress } from "../types/runProgress.ts";
import type { SwarmChildMessage, SwarmInit } from "../types/swarmMessages.ts";

const SWARM_ENTRY = resolve(import.meta.dir, "swarmProcess/swarmProcess.ts");
const MAX_WORKERS = 400;
/** scripts/tw/helpers/stripeBudget.ts rejects more than 4 workers per platform key. */
const MAX_WORKERS_PER_KEY = 4;
const WARM_POLL_MS = 5_000;
const FLUSH_MS = 2_000;
const LOG_TAIL_CHARS = 8_000;

/** `committed`: accounts may be claimed / sandboxes may exist for this run. */
type SwarmJobState = { committed?: boolean; sandboxIds?: string[] };

const sleep = ({ ms, signal }: { ms: number; signal: AbortSignal }) =>
	new Promise<void>((resolveSleep) => {
		const timer = setTimeout(resolveSleep, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolveSleep();
			},
			{ once: true },
		);
	});

/** Block until tw-warm:<sha12> is ready; (re)enqueues warm:<sha> if nothing live builds it. */
const waitForWarm = async ({
	ctx,
	run,
	signal,
}: {
	ctx: TwdContext;
	run: RunRow;
	signal: AbortSignal;
}) => {
	if (isWarmImageFresh({ row: await getWarmImage({ ctx, sha: run.sha }) }))
		return;
	const { job: warmJob } = await enqueueJob({
		ctx,
		kind: "warm",
		singletonKey: `warm:${run.sha}`,
		payload: { sha: run.sha, branch: run.branch },
	});
	while (!signal.aborted) {
		const warm = await getWarmImage({ ctx, sha: run.sha });
		if (isWarmImageFresh({ row: warm })) return;
		const [job] = await ctx.db
			.select()
			.from(jobs)
			.where(eq(jobs.id, warmJob.id));
		if (
			(warm?.status === "failed" && warm.jobId === warmJob.id) ||
			job?.status === "failed" ||
			job?.status === "cancelled"
		) {
			throw new Error(
				`warm build for ${run.sha.slice(0, 12)} failed: ${warm?.error ?? job?.error ?? job?.status}`,
			);
		}
		await sleep({ ms: WARM_POLL_MS, signal });
	}
};

/** A resumed job whose child already ran: the daemon died mid-run. Clean up, never re-run. */
const recoverCrashedSwarm = async ({
	ctx,
	run,
	state,
}: {
	ctx: TwdContext;
	run: RunRow;
	state: SwarmJobState;
}) => {
	await terminateSandboxes({ sandboxIds: state.sandboxIds ?? [] });
	await releaseRunAccounts({ ctx, runId: run.id });
	await updateRun({
		ctx,
		runId: run.id,
		set: {
			status: "errored",
			finishedAt: new Date(),
			progress: {
				...run.progress,
				phase: "errored",
				error:
					"twd restarted mid-run; leftover sandboxes were terminated. Rerun it.",
			},
		},
	});
};

/** payload: { runId }. Warm → claim accounts → swarm child → persist + fan out events. */
export const handleSwarmJob: JobHandler = async ({
	ctx: jobCtx,
	job,
	checkpoint,
	signal,
}) => {
	const ctx: TwdContext = { ...jobCtx, actor: jobCtx.actor ?? SYSTEM_ACTOR };
	const { runId } = job.payload as { runId: string };
	const { run } = await getRunWithEmail({ ctx, runId });
	if (isTerminalRunStatus({ status: run.status })) return;
	const state = job.state as SwarmJobState;
	if (state.committed) {
		await recoverCrashedSwarm({ ctx, run, state });
		return;
	}

	const abort = new AbortController();
	if (signal.aborted) abort.abort();
	signal.addEventListener("abort", () => abort.abort(), { once: true });
	const live = openLiveRun({
		runId,
		status: run.status,
		cancel: () => abort.abort(),
	});
	const progress: RunProgress = readRunProgress({ progress: run.progress });

	let writes = Promise.resolve();
	const enqueueWrite = (write: () => Promise<unknown>) => {
		writes = writes
			.then(write)
			.then(() => undefined)
			.catch((error: unknown) =>
				ctx.logger.error("swarm write failed", { runId, error: String(error) }),
			);
	};
	const setStatus = ({
		status,
		phase,
		set = {},
	}: {
		status: RunStatus;
		phase: string;
		set?: Partial<RunRow>;
	}) => {
		publishRunEvent({ runId, event: { type: "status", status, phase } });
		enqueueWrite(() =>
			updateRun({ ctx, runId, set: { ...set, status, progress: snapshot() } }),
		);
	};
	const snapshot = (): RunProgress => ({
		...progress,
		phase: live.phase,
		workers: [...live.workers.values()],
		files: [...live.files.values()],
	});
	const counts = () => {
		const files = [...live.files.values()];
		return {
			passed: files.filter((file) => file.status === "passed").length,
			failed: files.filter(
				(file) => file.status === "failed" || file.status === "crashed",
			).length,
		};
	};

	const sandboxIds: string[] = [];
	let checkpointedSandboxes = 0;
	const flush = () => {
		enqueueWrite(() =>
			updateRun({ ctx, runId, set: { progress: snapshot(), ...counts() } }),
		);
		if (sandboxIds.length === checkpointedSandboxes) return;
		checkpointedSandboxes = sandboxIds.length;
		enqueueWrite(() =>
			checkpoint({ committed: true, sandboxIds: [...sandboxIds] }).catch(
				(error: unknown) => {
					abort.abort();
					throw error;
				},
			),
		);
	};

	let accounts: ClaimedAccount[] = [];
	let childDone: Extract<SwarmChildMessage, { type: "done" }> | undefined;
	let exitCode: number | null = 0;
	let failure: string | undefined;
	const flushTimer = setInterval(flush, FLUSH_MS);
	try {
		setStatus({
			status: "warming",
			phase: "waiting for warm image",
			set: { startedAt: new Date() },
		});
		await waitForWarm({ ctx, run, signal: abort.signal });
		if (abort.signal.aborted) return;

		const files = await orderFilesLongestFirst({
			ctx,
			files: progress.plannedFiles ?? [],
		});
		const [{ usableKeys }] = await ctx.db
			.select({ usableKeys: count() })
			.from(stripeKeys)
			.where(and(eq(stripeKeys.usable, true), eq(stripeKeys.present, true)));
		const wanted = Math.min(
			files.length,
			MAX_WORKERS,
			usableKeys * MAX_WORKERS_PER_KEY,
		);
		if (wanted === 0) {
			throw new Error(
				files.length === 0
					? "run has no planned files"
					: "no usable Stripe keys — ask a twd admin to fix TW_V3_KEYS / run POST /keys/reinit",
			);
		}
		// From here a crash-resume must clean up (accounts, sandboxes), never re-run.
		await checkpoint({ committed: true, sandboxIds: [] });
		accounts = await claimAccountsForRun({
			ctx,
			runId,
			count: wanted,
			reservationId: run.reservationId ?? undefined,
		});
		if (accounts.length === 0) {
			throw new Error(
				"no clean Stripe accounts available — wait for nukes or free a reservation",
			);
		}

		setStatus({
			status: "provisioning",
			phase: "provisioning workers",
			set: { workerCount: accounts.length },
		});
		const init: SwarmInit = {
			type: "init",
			runId,
			sha: run.sha,
			files: files.map((testId) => toAbsoluteTestPath({ testId })),
			grep: run.selection.grep,
			accounts: accounts.map(({ accountId, secretKey }) => ({
				accountId,
				secretKey,
			})),
			ingressUrl: ctx.env.TWD_PUBLIC_URL,
			ingressToken: ctx.env.TWD_INGRESS_TOKEN,
		};
		({ exitCode } = await spawnTwChild<SwarmChildMessage>({
			entry: SWARM_ENTRY,
			init,
			env: { TW_MODAL_NO_STALE: "1" },
			signal: abort.signal,
			logger: ctx.logger,
			onMessage: (message) => {
				if (message.type === "done") {
					childDone = message;
				} else if (message.type === "phase") {
					setStatus({
						status: message.phase,
						phase: message.phase.replace("_", " "),
						set: message.workerCount
							? { workerCount: message.workerCount }
							: {},
					});
				} else if (message.type === "sandbox") {
					sandboxIds.push(message.sandboxId);
				} else if (message.type === "file") {
					publishRunEvent({
						runId,
						event: { type: "file", file: message.file },
					});
					if (message.final) {
						enqueueWrite(() =>
							recordFileResult({
								ctx,
								runId,
								branch: run.branch,
								sha: run.sha,
								result: message.file,
							}),
						);
					}
				} else {
					const event: RunEvent = message;
					publishRunEvent({ runId, event });
				}
			},
		}));
		if (
			childDone?.outcome === "errored" ||
			(!childDone && exitCode !== 0 && !abort.signal.aborted)
		) {
			failure = childDone?.error ?? `swarm child exited ${exitCode}`;
		}
	} catch (error) {
		failure = error instanceof Error ? error.message : String(error);
	} finally {
		clearInterval(flushTimer);
		if (exitCode !== 0) await terminateSandboxes({ sandboxIds });
		for (const { accountId } of accounts) deleteIngressRoute({ accountId });
		if (accounts.length > 0) {
			await releaseRunAccounts({ ctx, runId }).catch((error: unknown) =>
				ctx.logger.error("releaseRunAccounts failed", {
					runId,
					error: String(error),
				}),
			);
		}
		const { passed, failed } = counts();
		const status: RunStatus = abort.signal.aborted
			? "cancelled"
			: failure
				? "errored"
				: failed > 0
					? "failed"
					: "passed";
		progress.fileLogTails = Object.fromEntries(
			[...live.files.values()]
				.filter((file) => file.status !== "passed" && file.status !== "skipped")
				.map((file) => [
					file.file,
					(live.fileLogs.get(file.file) ?? "").slice(-LOG_TAIL_CHARS),
				]),
		);
		if (failure) progress.error = failure;
		setStatus({
			status,
			phase: failure ?? status,
			set: { passed, failed, finishedAt: new Date() },
		});
		await writes;
		retireLiveRun({ runId });
		await onRunFinished({ ctx, runId }).catch((error: unknown) =>
			ctx.logger.warn("baseline refresh failed", {
				runId,
				error: String(error),
			}),
		);
	}
	if (failure) throw new Error(failure);
};
