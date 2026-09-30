/**
 * Headless swarm child: one process per run (scripts/tw keeps module state).
 * Reuses scripts/tw's fork/boot/pool/executor/runner; talks to twd over Bun IPC.
 * Elastic: starts on the first account(s), and every `add_accounts` forks more workers.
 */
import {
	enableHub,
	getDurationMs,
	getWorkerOf,
	onHubEvent,
	setWorkerStatus,
} from "@tw/dashboard/hub.ts";
import { setLogSubscriber } from "@tw/helpers/logSink.ts";
import { planShardWorkers } from "@tw/helpers/planShardWorkers.ts";
import { stripeBudgetForRun } from "@tw/helpers/stripeBudget.ts";
import { runSwarmTests } from "@tw/tui/runnerCore.ts";
import { getTuiState, type TuiTestFile } from "@tw/tui/store.ts";
import pLimit from "p-limit";
import type {
	RunFile,
	WorkerBoot,
	WorkerState,
} from "../../../../api/contract.ts";
import { ACCOUNTS_PER_KEY_CAP } from "../../../accounts/allocator/poolLimits.ts";
import { TESTS_DIR, toTestId } from "../../../catalog/repoPaths.ts";
import type {
	SwarmAccount,
	SwarmChildMessage,
	SwarmInit,
	SwarmParentMessage,
} from "../../types/swarmMessages.ts";
import { createBootTimeline } from "./bootTimeline.ts";
import { createOutputGate, isWorkerEchoLine } from "./outputGate.ts";
import { createFailureBreaker, withTransientRetry } from "./provisionGuard.ts";
import {
	loadTwModules,
	type ProviderSandbox,
	type TestExecutor,
	type TwModules,
	type WorkerHandle,
	type WorkerPool,
} from "./twModules.ts";

const FILE_POLL_MS = 500;
const OUTPUT_FLUSH_MS = 1_000;
const PROGRESS_LOG_MS = 15_000;
const LAG_PROBE_MS = 250;
const TEARDOWN_TIMEOUT_MS = 20_000;
/** After this many failed forks/boots the run stops asking for accounts. */
const MAX_PROVISION_FAILURES = 5;
/** Concurrent Modal creates; an unbounded 3,000-wide burst gets RESOURCE_EXHAUSTED from its control plane. */
const FORK_CONCURRENCY = 64;

const send = (message: SwarmChildMessage) => process.send?.(message);

let teardown: (() => Promise<void>) | undefined;
let cancelled = false;

/** Accounts that arrive before main() can fork workers. */
const inbox: SwarmAccount[] = [];
let grow: ((accounts: SwarmAccount[]) => void) | undefined;
const receiveAccounts = (accounts: SwarmAccount[]) => {
	if (grow) grow(accounts);
	else inbox.push(...accounts);
};

/** Give the IPC channel a moment to flush the final message before exiting. */
const finish = async ({
	message,
	exitCode,
}: {
	message: SwarmChildMessage;
	exitCode: number;
}) => {
	send(message);
	await Bun.sleep(500);
	process.exit(exitCode);
};

const toRunFile = (file: TuiTestFile): { file: RunFile; final: boolean } => {
	const final =
		file.status === "passed" ||
		file.status === "skipped" ||
		(file.status === "failed" && !file.willRetry);
	const worker = getWorkerOf(file.file) ?? null;
	const status: RunFile["status"] =
		file.status === "pending" || (file.status === "running" && !worker)
			? "queued"
			: file.status === "failed"
				? final
					? file.crashError
						? "crashed"
						: "failed"
					: "running"
				: file.status === "retrying"
					? "running"
					: file.status;
	const failureSummary =
		file.crashError?.slice(0, 2000) ??
		(file.failedTests.length > 0
			? file.failedTests
					.map(
						(test) =>
							`✗ ${test.name}${test.message ? `\n  ${test.message}` : ""}`,
					)
					.join("\n")
					.slice(0, 2000)
			: null);
	return {
		final,
		file: {
			file: toTestId({ absolutePath: file.file }),
			status,
			durationMs: final ? (getDurationMs(file.file) ?? null) : null,
			attempt: file.attempt,
			passedTests: file.passed,
			failedTests: file.failed,
			worker,
			failureSummary,
		},
	};
};

const timeBoxed = (action: () => Promise<unknown>) =>
	Promise.race([
		action().catch(() => undefined),
		new Promise((resolve) => setTimeout(resolve, TEARDOWN_TIMEOUT_MS)),
	]);

type Shard = {
	isSvix: boolean;
	files: string[];
	/** Planned share of the run's workers; picks which shard a new account joins. */
	target: number;
	started: number;
	provisioning: number;
	pool: WorkerPool;
	ready: Promise<void>;
	markReady: () => void;
	fail: (error: Error) => void;
};

const main = async (init: SwarmInit) => {
	// run.ts sizes its Stripe pool from env at import time; the pool is this run's keys.
	process.env.STRIPE_TEST_KEY_POOL = [
		...new Set(init.accounts.map((account) => account.secretKey)),
	].join(",");
	process.env.STRIPE_TEST_KEY_POOL_OLD = "";

	setLogSubscriber((line) => {
		if (line.trim() && !isWorkerEchoLine(line))
			send({ type: "log", file: null, worker: null, text: line });
	});
	const outputGate = createOutputGate();
	enableHub();
	const boot = createBootTimeline();
	const bootOf = new Map<string, WorkerBoot>();
	const workerState = (
		name: string,
		status: WorkerState["status"],
		file: string | null,
	): WorkerState => ({ name, status, file, boot: bootOf.get(name) ?? null });
	// Test and server output arrive as thousands of tiny chunks: coalesce per stream before IPC.
	const outputBuffer = new Map<
		string,
		{ file: string | null; worker: string | null; text: string }
	>();
	const bufferOutput = (
		file: string | null,
		worker: string | null,
		text: string,
	) => {
		const key = `${file}\u0000${worker}`;
		const pending = outputBuffer.get(key);
		if (pending) pending.text += text;
		else outputBuffer.set(key, { file, worker, text });
	};
	const flushOutput = () => {
		for (const { file, worker, text } of outputBuffer.values())
			send({ type: "log", file, worker, text });
		outputBuffer.clear();
	};
	const outputTimer = setInterval(flushOutput, OUTPUT_FLUSH_MS);
	const workerFile = new Map<string, string>();
	const startedFiles = new Set<string>();
	const shardOf = new Map<string, Shard>();
	const streamingFiles = new Set<string>();
	let finishedFiles = 0;
	onHubEvent((event) => {
		if (event.type === "fileOutput") {
			streamingFiles.add(event.file);
			bufferOutput(
				toTestId({ absolutePath: event.file }),
				getWorkerOf(event.file) ?? null,
				event.chunk,
			);
		} else if (event.type === "workerOutput") {
			if (outputGate.forwardWorker(event.worker)) {
				boot.recordOutput(event.worker, event.chunk);
				bufferOutput(null, event.worker, event.chunk);
			}
		} else if (event.type === "workerStatus") {
			workerFile.delete(event.worker);
			if (event.status === "ready") boot.mark(event.worker, "ready");
			send({
				type: "worker",
				worker: workerState(event.worker, event.status, null),
			});
		} else if (event.type === "fileWorker") {
			const file = toTestId({ absolutePath: event.file });
			workerFile.set(event.worker, event.file);
			if (!startedFiles.has(event.file)) {
				startedFiles.add(event.file);
				const shard = shardOf.get(event.file);
				if (shard) shard.started++;
			}
			send({
				type: "worker",
				worker: workerState(event.worker, "busy", file),
			});
		}
	});

	const tw = await loadTwModules();
	await tw.provider.setProvider("modalv2");
	const { SERVER_PORT, WARM_SANDBOX_PREFIX } = tw.constants;

	const abort = new AbortController();
	const signal = abort.signal;
	const sandboxes = new Map<string, ProviderSandbox>();
	const svixAppIds: string[] = [];
	let teardownPromise: Promise<void> | undefined;

	teardown = () => {
		teardownPromise ??= (async () => {
			send({ type: "phase", phase: "tearing_down" });
			const limit = pLimit(16);
			await Promise.all([
				...[...sandboxes.values()].map((sandbox) =>
					limit(() => timeBoxed(() => tw.provider.deleteSandbox(sandbox))),
				),
				...svixAppIds.map((appId) =>
					limit(() => timeBoxed(() => tw.run.deleteSvixApp(appId))),
				),
			]);
		})();
		return teardownPromise;
	};
	const track = ({
		name,
		sandbox,
		accountId,
	}: {
		name: string;
		sandbox: ProviderSandbox;
		accountId: string;
	}) => {
		sandboxes.set(name, sandbox);
		send({
			type: "worker_started",
			name,
			sandboxId: sandbox.id ?? null,
			accountId,
		});
		if (teardownPromise)
			void timeBoxed(() => tw.provider.deleteSandbox(sandbox));
	};
	/** Culled, dead or failed worker: delete its sandbox, then hand its account back early. */
	const retire = async ({
		name,
		accountId,
	}: {
		name: string;
		accountId: string;
	}) => {
		const sandbox = sandboxes.get(name);
		sandboxes.delete(name);
		if (sandbox) await timeBoxed(() => tw.provider.deleteSandbox(sandbox));
		send({ type: "worker_ended", name, accountId });
	};

	process.once("SIGTERM", () => {
		cancelled = true;
		abort.abort();
		void teardown?.().finally(() =>
			finish({
				message: { type: "done", outcome: "cancelled" },
				exitCode: 130,
			}),
		);
	});

	const warmName = `${WARM_SANDBOX_PREFIX}-${init.sha.slice(0, 12)}`;
	if (!(await tw.provider.getSandboxByName(warmName))) {
		throw new Error(
			`warm image tw-warm:${init.sha.slice(0, 12)} is not published`,
		);
	}

	const { svixFiles, normalFiles } = await partitionAtSha({ tw, init });
	const { totalWorkers, svixWorkers } = planShardWorkers({
		workers: init.workersWanted,
		normalFileCount: normalFiles.length,
		svixFileCount: svixFiles.length,
	});
	// Sized as if every key ran its full cap, so growing never pushes a key over budget.
	const budget = stripeBudgetForRun({
		workers: init.usableKeys * ACCOUNTS_PER_KEY_CAP,
		keys: init.usableKeys,
	});
	send({ type: "phase", phase: "provisioning" });

	const sandboxByName = new Map<string, ProviderSandbox>();
	const resolveSandbox = (worker: WorkerHandle) =>
		sandboxByName.get(worker.name);
	class ElasticPool extends tw.pool.WorkerPool {
		cullIdle(count: number, keepMin: number): WorkerHandle[] {
			const culled = super.cullIdle(count, keepMin);
			for (const worker of culled) {
				sandboxByName.delete(worker.name);
				if (worker.accountId)
					void retire({ name: worker.name, accountId: worker.accountId });
			}
			return culled;
		}
		markDead(worker: WorkerHandle): void {
			super.markDead(worker);
			sandboxByName.delete(worker.name);
			if (worker.accountId)
				void retire({ name: worker.name, accountId: worker.accountId });
		}
	}
	const makeShard = ({
		isSvix,
		files,
		target,
	}: {
		isSvix: boolean;
		files: string[];
		target: number;
	}): Shard => {
		let markReady = () => {};
		let fail: (error: Error) => void = () => {};
		const ready = new Promise<void>((resolveReady, rejectReady) => {
			markReady = resolveReady;
			fail = rejectReady;
		});
		const shard: Shard = {
			isSvix,
			files,
			target: Math.max(1, target),
			started: 0,
			provisioning: 0,
			pool: new ElasticPool([], 1),
			ready,
			markReady,
			fail,
		};
		for (const file of files) shardOf.set(file, shard);
		return shard;
	};
	const shards = [
		makeShard({
			isSvix: false,
			files: normalFiles,
			target: totalWorkers - svixWorkers,
		}),
		makeShard({ isSvix: true, files: svixFiles, target: svixWorkers }),
	];
	const [normalShard] = shards;
	const workersOf = (shard: Shard) => shard.pool.size + shard.provisioning;
	const shortfall = (shard: Shard) =>
		Math.max(0, shard.files.length - shard.started - workersOf(shard));

	let provisionFailures = 0;
	const breaker = createFailureBreaker({ limit: MAX_PROVISION_FAILURES });
	const forkLimit = pLimit(FORK_CONCURRENCY);
	let firstFailure: string | undefined;
	let nextWorkerIdx = 0;
	let lastDemand: number | undefined;
	let stopCulling: (() => void) | undefined;
	const currentDemand = () =>
		teardownPromise || breaker.tripped()
			? 0
			: shards.reduce((sum, shard) => sum + shortfall(shard), 0);
	/** Tell twd how many more accounts help; once none do, the tail starts culling idle workers. */
	const reportDemand = () => {
		const demand = currentDemand();
		if (demand === 0 && !stopCulling && normalShard.pool.size > 0) {
			stopCulling = tw.run.startCulling(normalShard.pool, resolveSandbox);
		}
		if (demand === lastDemand) return;
		lastDemand = demand;
		send({ type: "demand", workers: demand });
	};

	const provision = async ({
		account,
		shard,
	}: {
		account: SwarmAccount;
		shard: Shard;
	}) => {
		const name = `tw-twd-${init.runId}-${nextWorkerIdx++}`;
		shard.provisioning++;
		boot.mark(name, "account");
		setWorkerStatus(name, "provisioning");
		let sandbox: ProviderSandbox | undefined;
		try {
			let svixAppId: string | undefined;
			if (shard.isSvix) {
				svixAppId = await tw.svix.createSvixApp(tw.testOrg.TEST_ORG_CONFIG.id);
				svixAppIds.push(svixAppId);
			}
			boot.mark(name, "forkStart");
			const forkOptions = {
				sourceSandbox: warmName,
				name,
				env: {
					...tw.run.buildWorkerEnv({
						stripeAccountId: account.accountId,
						stripeSecretKey: account.secretKey,
						isSvixShard: shard.isSvix,
						svixAppId,
						ingressUrl: init.ingressUrl,
						ingressToken: init.ingressToken,
					}),
					TW_TARGET_SHA: init.sha,
					TW_STRIPE_MAX_RPS: String(budget.maxRps),
					TW_STRIPE_MAX_INFLIGHT: String(budget.maxInFlight),
				},
				tags: { owner: "twd", run: init.runId, kind: "bun-tw" },
				signal,
			};
			sandbox = await forkLimit(() =>
				withTransientRetry({ run: () => tw.provider.forkWorker(forkOptions) }),
			);
			boot.mark(name, "forkDone");
			track({ name, sandbox, accountId: account.accountId });
			const publicUrl = await tw.provider.getPublicUrl(sandbox, SERVER_PORT);
			boot.mark(name, "execStart");
			await tw.run.waitForReady({ sandbox, name, signal });
			await tw.ingress.pushWorkerMapping({
				ingressUrl: init.ingressUrl,
				token: init.ingressToken,
				accountId: account.accountId,
				workerUrl: publicUrl,
			});
			boot.mark(name, "mapped");
			outputGate.markServing(name);
			const timeline = boot.finish(name);
			if (timeline) bootOf.set(name, timeline);
			send({ type: "worker", worker: workerState(name, "ready", null) });
			sandboxByName.set(name, sandbox);
			shard.provisioning--;
			shard.pool.add({
				name,
				sandboxId: sandbox.name,
				publicUrl,
				accountId: account.accountId,
				isSvixShard: shard.isSvix,
				inFlight: 0,
			});
			shard.markReady();
			breaker.success();
		} catch (error) {
			shard.provisioning--;
			provisionFailures++;
			breaker.failure();
			const reason = error instanceof Error ? error.message : String(error);
			firstFailure ??= reason;
			setWorkerStatus(name, "failed", reason.slice(0, 300));
			if (sandbox) void retire({ name, accountId: account.accountId });
			else send({ type: "release_accounts", accountIds: [account.accountId] });
			// Only once nothing is in flight: a slower provision may still succeed and reset the breaker.
			const inFlight = shards.some((s) => s.provisioning > 0);
			if (breaker.tripped() && !inFlight) {
				for (const stuck of shards) {
					if (stuck.files.length === 0 || workersOf(stuck) > 0) continue;
					stuck.fail(
						new Error(
							`${provisionFailures} worker(s) failed to provision and none are up (first: ${firstFailure})`,
						),
					);
				}
			}
		} finally {
			reportDemand();
		}
	};

	const withGrep = (executor: TestExecutor): TestExecutor =>
		init.grep
			? {
					run: (args) =>
						executor.run({ ...args, failedTestNames: [init.grep ?? ""] }),
				}
			: executor;
	let running = false;
	const totalFiles = svixFiles.length + normalFiles.length;
	// pool.acquire gates on idle workers, so the window is every file and grows with the pool.
	const runShard = async (shard: Shard) => {
		if (shard.files.length === 0) return;
		await shard.ready;
		if (!running) {
			running = true;
			send({ type: "phase", phase: "running" });
		}
		await runSwarmTests(
			shard.files,
			withGrep(
				new tw.remoteExecutor.RemoteExecutor({
					pool: shard.pool,
					resolveSandbox,
					toWorkerPath: tw.run.toSandboxPath,
				}),
			),
			{ maxParallel: shard.files.length, totalFiles },
		);
	};

	const lastSent = new Map<string, string>();
	const flushFiles = () => {
		flushOutput();
		for (const tuiFile of getTuiState().files.values()) {
			const { file, final } = toRunFile(tuiFile);
			const key = JSON.stringify(file);
			if (lastSent.get(file.file) === key) continue;
			lastSent.set(file.file, key);
			if (final) finishedFiles++;
			send({ type: "file", file, final });
			if (file.status !== "running") {
				for (const [worker, current] of workerFile) {
					if (current !== tuiFile.file) continue;
					workerFile.delete(worker);
					send({
						type: "worker",
						worker: workerState(worker, "ready", null),
					});
				}
			}
		}
		reportDemand();
	};
	const poll = setInterval(flushFiles, FILE_POLL_MS);
	// Where a wide run is stuck: dispatch vs streaming vs done, pool state, and event-loop lag.
	let lastTick = performance.now();
	let maxLagMs = 0;
	const lagProbe = setInterval(() => {
		const now = performance.now();
		maxLagMs = Math.max(maxLagMs, now - lastTick - LAG_PROBE_MS);
		lastTick = now;
	}, LAG_PROBE_MS);
	const progress = setInterval(() => {
		const pools = shards.map(
			(shard) =>
				`${shard.isSvix ? "svix" : "main"} ${shard.pool.size} up/${shard.pool.idleCount} idle/${shard.provisioning} booting`,
		);
		const line = `[twd-progress] dispatched ${startedFiles.size} · streaming ${streamingFiles.size} · finished ${finishedFiles}/${totalFiles} · ${pools.join(" · ")} · max loop lag ${Math.round(maxLagMs)}ms\n`;
		// stdout too: twd forwards child output to its own logs, so this survives any log budget.
		console.log(line.trimEnd());
		send({ type: "log", file: null, worker: null, text: line });
		maxLagMs = 0;
	}, PROGRESS_LOG_MS);

	const runs = shards.map(runShard);
	grow = (accounts) => {
		const surplus: string[] = [];
		for (const account of accounts) {
			const shard = currentDemand() > 0 ? pickShard(shards) : undefined;
			if (!shard) {
				surplus.push(account.accountId);
				continue;
			}
			void provision({ account, shard });
		}
		if (surplus.length > 0)
			send({ type: "release_accounts", accountIds: surplus });
		reportDemand();
	};
	grow(inbox.splice(0));

	try {
		const settled = await Promise.allSettled(runs);
		for (const result of settled) {
			if (result.status === "rejected") throw result.reason;
		}
	} finally {
		grow = (accounts) =>
			send({
				type: "release_accounts",
				accountIds: accounts.map(({ accountId }) => accountId),
			});
		clearInterval(poll);
		clearInterval(lagProbe);
		clearInterval(progress);
		clearInterval(outputTimer);
		flushOutput();
		flushFiles();
		stopCulling?.();
		for (const shard of shards) shard.pool.close();
	}
};

/** The shard that can still use a worker and is furthest below its planned share. */
const pickShard = (shards: Shard[]): Shard | undefined =>
	shards
		.filter(
			(shard) =>
				shard.files.length - shard.started >
				shard.pool.size + shard.provisioning,
		)
		.reduce<Shard | undefined>(
			(best, shard) =>
				!best ||
				(shard.pool.size + shard.provisioning) / shard.target <
					(best.pool.size + best.provisioning) / best.target
					? shard
					: best,
			undefined,
		);

process.once("message", (init: SwarmInit) => {
	process.on("message", (message: SwarmParentMessage) => {
		if (message.type === "add_accounts") {
			if (cancelled) {
				send({
					type: "release_accounts",
					accountIds: message.accounts.map(({ accountId }) => accountId),
				});
				return;
			}
			receiveAccounts(message.accounts);
		}
	});
	receiveAccounts(init.accounts);
	main(init)
		.then(async () => {
			await teardown?.();
			await finish({
				message: { type: "done", outcome: "completed" },
				exitCode: 0,
			});
		})
		.catch(async (error: unknown) => {
			if (cancelled) return;
			await teardown?.().catch(() => undefined);
			await finish({
				message: {
					type: "done",
					outcome: "errored",
					error: error instanceof Error ? error.message : String(error),
				},
				exitCode: 1,
			});
		});
});
process.send?.({ type: "ready" });

/** Svix detection reads file contents, so read them at the run's sha, then hand back twd-local paths. */
const partitionAtSha = async ({
	tw,
	init,
}: {
	tw: TwModules;
	init: SwarmInit;
}) => {
	const toShaPath = (file: string) =>
		file.replace(TESTS_DIR, init.testsDirAtSha);
	const toLocalPath = (file: string) =>
		file.replace(init.testsDirAtSha, TESTS_DIR);
	const { svixFiles, normalFiles } = await tw.svix.partitionShards(
		init.files.map(toShaPath),
	);
	return {
		svixFiles: svixFiles.map(toLocalPath),
		normalFiles: normalFiles.map(toLocalPath),
	};
};
