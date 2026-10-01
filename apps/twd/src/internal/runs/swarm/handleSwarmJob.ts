import { resolve } from "node:path";
import { resolveStripeConnectShard } from "@tw/helpers/stripeConnectShard.ts";
import { count, eq } from "drizzle-orm";
import type { RunEvent, RunMilestones } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { RunStatus } from "../../../db/schema/runs.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	type ClaimedAccount,
	releaseRunAccounts,
	returnUnusedAccounts,
} from "../../accounts/actions/accountLedger.ts";
import {
	kickAllocator,
	type RunDemand,
	registerRunDemand,
} from "../../accounts/allocator/accountAllocator.ts";
import {
	ACCOUNTS_PER_KEY_CAP,
	MAX_RUN_WORKERS,
} from "../../accounts/allocator/poolLimits.ts";
import { usableKey } from "../../accounts/repos/cleanAccountsRepo.ts";
import { getTestTreeAtSha } from "../../catalog/actions/getTestTreeAtSha.ts";
import { toAbsoluteTestPath } from "../../catalog/repoPaths.ts";
import { accrueRunCost } from "../../costs/actions/accrueRunCost.ts";
import {
	clearShardRoutesForRun,
	dropIngressAccounts,
	setShardRoute,
} from "../../ingress/actions/ingressRoutes.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { stripeForKey } from "../../keys/stripeForKey.ts";
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
import { createRunLogWriter } from "../logs/runLogWriter.ts";
import { terminateSandboxes } from "../modal/modalClient.ts";
import {
	getRunWithEmail,
	isTerminalRunStatus,
	type RunRow,
	updateRun,
} from "../repos/runsRepo.ts";
import { endRunWorkers, insertRunWorker } from "../repos/runWorkersRepo.ts";
import { getWarmImage, isWarmImageFresh } from "../repos/warmImagesRepo.ts";
import { spawnTwChild } from "../spawnTwChild.ts";
import { type RunProgress, readRunProgress } from "../types/runProgress.ts";
import type {
	SwarmChildMessage,
	SwarmInit,
	SwarmParentMessage,
} from "../types/swarmMessages.ts";
import { countPooledFiles } from "./countPooledFiles.ts";
import { deleteStripeConnectAccounts } from "./deleteStripeConnectAccounts.ts";
import { acquireStripeConnectLease } from "./stripeConnectLease.ts";

const SWARM_ENTRY = resolve(import.meta.dir, "swarmProcess/swarmProcess.ts");
const WARM_POLL_MS = 5_000;
const FLUSH_MS = 2_000;
const ACCRUE_MS = 10_000;
const LOG_TAIL_CHARS = 8_000;

/** `committed`: accounts may be claimed / sandboxes may exist for this run. */
type SwarmJobState = {
	committed?: boolean;
	sandboxIds?: string[];
	/** Set once the run holds the stripe-connect lease; recovery sweeps that run's sub-accounts. */
	shardAccountIds?: string[];
};

/** Before the lease goes, so the next run's fallback route never meets this run's accounts. */
const deleteRunShardAccounts = async ({
	ctx,
	runId,
	accountIds,
}: {
	ctx: TwdContext;
	runId: string;
	accountIds: string[];
}) => {
	const secret = ctx.env.SHARD_STRIPE_SANDBOX_KEY.trim();
	if (!secret) {
		if (accountIds.length > 0)
			ctx.logger.warn("stripe-connect sub-accounts left: shard key unset", {
				accountIds,
			});
		return;
	}
	const failed = await deleteStripeConnectAccounts({
		runId,
		accountIds,
		stripe: stripeForKey({ secret }),
		logger: ctx.logger,
	});
	dropIngressAccounts({ accountIds: [...accountIds, ...failed] });
};

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

const toSwarmAccount = ({ accountId, secretKey }: ClaimedAccount) => ({
	accountId,
	secretKey,
});

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
	if (state.shardAccountIds)
		await deleteRunShardAccounts({
			ctx,
			runId: run.id,
			accountIds: state.shardAccountIds,
		});
	await releaseRunAccounts({ ctx, runId: run.id });
	await endRunWorkers({ ctx, runId: run.id });
	await accrueRunCost({ ctx, runId: run.id });
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

/**
 * payload: { runId }. Warm → wait in the FIFO account queue → start the child on the first
 * account(s) → feed it more as the allocator frees them → persist + fan out events.
 */
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
	const milestones: RunMilestones = progress.milestones ?? {
		warmReadyAt: null,
		accountsAt: null,
	};
	const fileFinishedAt = new Map<string, string>();
	const workerReadyAt = new Map<string, string>();

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
		publishRunEvent({
			runId,
			event: { type: "status", status, phase, milestones },
		});
		enqueueWrite(() =>
			updateRun({ ctx, runId, set: { ...set, status, progress: snapshot() } }),
		);
	};
	const snapshot = (): RunProgress => ({
		...progress,
		milestones,
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
	const workers = new Set<string>();
	const shardAccountIds: string[] = [];
	let shardLeaseHeld = false;
	let checkpointed = 0;
	const flush = () => {
		enqueueWrite(() =>
			updateRun({
				ctx,
				runId,
				set: { progress: snapshot(), workerCount: workers.size, ...counts() },
			}),
		);
		if (sandboxIds.length + shardAccountIds.length === checkpointed) return;
		checkpointed = sandboxIds.length + shardAccountIds.length;
		const state: SwarmJobState = {
			committed: true,
			sandboxIds: [...sandboxIds],
			...(shardLeaseHeld ? { shardAccountIds: [...shardAccountIds] } : {}),
		};
		enqueueWrite(() =>
			checkpoint(state).catch((error: unknown) => {
				abort.abort();
				throw error;
			}),
		);
	};
	const accrue = () =>
		accrueRunCost({ ctx, runId }).catch((error: unknown) =>
			ctx.logger.warn("accrueRunCost failed", { runId, error: String(error) }),
		);

	// Accounts from the FIFO allocator: parked until the child exists, then sent over IPC.
	let closed = false;
	let delivered = 0;
	let sendToChild: ((message: SwarmParentMessage) => void) | undefined;
	const parked: ClaimedAccount[] = [];
	let onFirstAccounts = () => {};
	const firstAccounts = new Promise<void>((resolveFirst) => {
		onFirstAccounts = resolveFirst;
	});
	const demand: RunDemand = {
		wants: 0,
		deliver: (accounts) => {
			if (closed || abort.signal.aborted) {
				void returnUnusedAccounts({
					ctx,
					runId,
					accountIds: accounts.map(({ accountId }) => accountId),
				}).catch((error: unknown) =>
					ctx.logger.error("returning accounts failed", {
						runId,
						error: String(error),
					}),
				);
				return;
			}
			delivered += accounts.length;
			if (sendToChild) {
				sendToChild({
					type: "add_accounts",
					accounts: accounts.map(toSwarmAccount),
				});
				return;
			}
			parked.push(...accounts);
			onFirstAccounts();
		},
	};
	let unregister = () => {};
	let releaseShardLease = () => {};
	abort.signal.addEventListener(
		"abort",
		() => {
			demand.wants = 0;
			onFirstAccounts();
		},
		{ once: true },
	);

	let childDone: Extract<SwarmChildMessage, { type: "done" }> | undefined;
	let exitCode: number | null = 0;
	let failure: string | undefined;
	const flushTimer = setInterval(flush, FLUSH_MS);
	const logWriter = createRunLogWriter({ ctx, runId });
	const accrueTimer = setInterval(() => void accrue(), ACCRUE_MS);
	try {
		const files = await orderFilesLongestFirst({
			ctx,
			files: progress.plannedFiles ?? [],
		});
		const [{ usableKeys }] = await ctx.db
			.select({ usableKeys: count() })
			.from(stripeKeys)
			.where(usableKey);
		const { testsDir: testsDirAtSha } = await getTestTreeAtSha({
			ctx,
			sha: run.sha,
		});
		const pooledFiles = await countPooledFiles({
			testIds: files,
			testsDirAtSha,
		});
		const workersWanted = Math.min(
			pooledFiles,
			run.maxWorkers ?? Number.POSITIVE_INFINITY,
			usableKeys * ACCOUNTS_PER_KEY_CAP,
			MAX_RUN_WORKERS,
		);
		setStatus({
			status: "warming",
			phase: "waiting for warm image",
			set: { startedAt: new Date(), workersWanted },
		});
		if (files.length === 0) throw new Error("run has no planned files");
		if (pooledFiles > 0 && workersWanted === 0) {
			throw new Error(
				"no usable Stripe keys — import keys on the Stripe keys page, then Re-initialise",
			);
		}
		await waitForWarm({ ctx, run, signal: abort.signal });
		if (abort.signal.aborted) return;
		milestones.warmReadyAt = new Date().toISOString();

		// From here a crash-resume must clean up (accounts, sandboxes), never re-run.
		await checkpoint({ committed: true, sandboxIds: [] });
		// A run of only stripe-connect files brings its own account, so it never queues for the pool.
		if (workersWanted > 0) {
			setStatus({ status: "queued", phase: "waiting for a free account" });
			demand.wants = workersWanted;
			unregister = registerRunDemand({ runId, demand });
			await firstAccounts;
			if (abort.signal.aborted) return;
		}
		milestones.accountsAt = new Date().toISOString();

		setStatus({ status: "provisioning", phase: "provisioning workers" });
		const init: SwarmInit = {
			type: "init",
			runId,
			sha: run.sha,
			files: files.map((testId) => toAbsoluteTestPath({ testId })),
			testsDirAtSha,
			grep: run.selection.grep,
			accounts: parked.splice(0).map(toSwarmAccount),
			workersWanted,
			usableKeys,
			ingressUrl: ctx.env.TWD_PUBLIC_URL,
			ingressToken: ctx.env.TWD_INGRESS_TOKEN,
			stripeConnectShard: resolveStripeConnectShard(ctx.env) ?? undefined,
		};
		({ exitCode } = await spawnTwChild<SwarmChildMessage, SwarmParentMessage>({
			entry: SWARM_ENTRY,
			init,
			env: { TW_MODAL_NO_STALE: "1" },
			signal: abort.signal,
			logger: ctx.logger,
			onInitSent: (send) => {
				sendToChild = send;
				if (parked.length > 0) {
					send({
						type: "add_accounts",
						accounts: parked.splice(0).map(toSwarmAccount),
					});
				}
			},
			onMessage: (message) => {
				if (message.type === "done") {
					childDone = message;
				} else if (message.type === "phase") {
					setStatus({
						status: message.phase,
						phase: message.phase.replace("_", " "),
					});
				} else if (message.type === "worker_started") {
					if (message.sandboxId) sandboxIds.push(message.sandboxId);
					workers.add(message.name);
					enqueueWrite(() =>
						insertRunWorker({
							ctx,
							runId,
							name: message.name,
							sandboxId: message.sandboxId,
							accountId: message.accountId,
						}),
					);
				} else if (message.type === "worker_ended") {
					workers.delete(message.name);
					enqueueWrite(async () => {
						await endRunWorkers({ ctx, runId, name: message.name });
						await releaseRunAccounts({
							ctx,
							runId,
							accountIds: [message.accountId],
						});
					});
				} else if (message.type === "release_accounts") {
					enqueueWrite(async () => {
						await returnUnusedAccounts({
							ctx,
							runId,
							accountIds: message.accountIds,
						});
						kickAllocator();
					});
				} else if (message.type === "shard_account") {
					shardAccountIds.push(message.accountId);
					flush();
				} else if (message.type === "shard_lease_request") {
					void acquireStripeConnectLease().then((release) => {
						releaseShardLease = release;
						shardLeaseHeld = true;
						enqueueWrite(() =>
							checkpoint({
								committed: true,
								sandboxIds: [...sandboxIds],
								shardAccountIds: [...shardAccountIds],
							}),
						);
						if (closed || abort.signal.aborted) release();
						else sendToChild?.({ type: "shard_lease_granted" });
					});
				} else if (message.type === "shard_route") {
					if (message.workerUrl)
						setShardRoute({
							shard: message.shard,
							workerUrl: message.workerUrl,
							runId,
						});
					else clearShardRoutesForRun({ runId });
				} else if (message.type === "demand") {
					const grew = message.workers > demand.wants;
					demand.wants = abort.signal.aborted ? 0 : message.workers;
					if (grew) kickAllocator();
				} else if (message.type === "file") {
					if (message.final)
						fileFinishedAt.set(message.file.file, new Date().toISOString());
					const file = {
						...message.file,
						finishedAt: fileFinishedAt.get(message.file.file) ?? null,
					};
					publishRunEvent({ runId, event: { type: "file", file } });
					if (message.final) {
						enqueueWrite(() =>
							recordFileResult({
								ctx,
								runId,
								branch: run.branch,
								sha: run.sha,
								result: file,
							}),
						);
					}
				} else {
					let event: RunEvent = message;
					if (event.type === "worker") {
						const { worker } = event;
						if (
							worker.status === "ready" &&
							worker.boot &&
							!workerReadyAt.has(worker.name)
						)
							workerReadyAt.set(worker.name, new Date().toISOString());
						event = {
							...event,
							worker: {
								...worker,
								readyAt: workerReadyAt.get(worker.name) ?? null,
							},
						};
					}
					if (event.type === "log") {
						logWriter.append({
							file: event.file,
							worker: event.worker,
							chunk: event.text,
						});
						// Worker server output is stored for /logs?worker= but too chatty to stream live.
						if (event.worker && !event.file) return;
					}
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
		closed = true;
		sendToChild = undefined;
		unregister();
		clearInterval(flushTimer);
		await logWriter.close();
		clearInterval(accrueTimer);
		if (exitCode !== 0) await terminateSandboxes({ sandboxIds });
		if (shardLeaseHeld)
			await deleteRunShardAccounts({ ctx, runId, accountIds: shardAccountIds });
		clearShardRoutesForRun({ runId });
		releaseShardLease();
		await writes;
		await returnUnusedAccounts({
			ctx,
			runId,
			accountIds: parked.splice(0).map(({ accountId }) => accountId),
		}).catch(() => undefined);
		if (delivered > 0) {
			await releaseRunAccounts({ ctx, runId }).catch((error: unknown) =>
				ctx.logger.error("releaseRunAccounts failed", {
					runId,
					error: String(error),
				}),
			);
		}
		workers.clear();
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
		enqueueWrite(() => endRunWorkers({ ctx, runId }));
		enqueueWrite(accrue);
		setStatus({
			status,
			phase: failure ?? status,
			set: { passed, failed, workerCount: 0, finishedAt: new Date() },
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
