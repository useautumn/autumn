/**
 * Headless swarm child: one process per run (scripts/tw keeps module state).
 * Reuses scripts/tw's fork/boot/pool/executor/runner; talks to twd over Bun IPC.
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
import { runShardTests } from "@tw/tui/runShardTests.ts";
import { getTuiState, type TuiTestFile } from "@tw/tui/store.ts";
import pLimit from "p-limit";
import type { RunFile } from "../../../../api/contract.ts";
import { TESTS_DIR, toTestId } from "../../../catalog/repoPaths.ts";
import type {
	SwarmChildMessage,
	SwarmInit,
} from "../../types/swarmMessages.ts";
import {
	loadTwModules,
	type ProviderSandbox,
	type TestExecutor,
	type TwModules,
	type WorkerHandle,
} from "./twModules.ts";

const FILE_POLL_MS = 500;
const TEARDOWN_TIMEOUT_MS = 20_000;

const send = (message: SwarmChildMessage) => process.send?.(message);

let teardown: (() => Promise<void>) | undefined;
let cancelled = false;

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
	const status: RunFile["status"] =
		file.status === "pending"
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
			worker: getWorkerOf(file.file) ?? null,
			failureSummary,
		},
	};
};

const timeBoxed = (action: () => Promise<unknown>) =>
	Promise.race([
		action().catch(() => undefined),
		new Promise((resolve) => setTimeout(resolve, TEARDOWN_TIMEOUT_MS)),
	]);

const main = async (init: SwarmInit) => {
	// run.ts sizes its Stripe pool from env at import time; the pool is this run's keys.
	process.env.STRIPE_TEST_KEY_POOL = [
		...new Set(init.accounts.map((account) => account.secretKey)),
	].join(",");
	process.env.STRIPE_TEST_KEY_POOL_OLD = "";

	setLogSubscriber((line) => {
		if (line.trim())
			send({ type: "log", file: null, worker: null, text: line });
	});
	enableHub();
	const workerFile = new Map<string, string>();
	onHubEvent((event) => {
		if (event.type === "fileOutput") {
			send({
				type: "log",
				file: toTestId({ absolutePath: event.file }),
				worker: getWorkerOf(event.file) ?? null,
				text: event.chunk,
			});
		} else if (event.type === "workerStatus") {
			workerFile.delete(event.worker);
			send({
				type: "worker",
				worker: { name: event.worker, status: event.status, file: null },
			});
		} else if (event.type === "fileWorker") {
			const file = toTestId({ absolutePath: event.file });
			workerFile.set(event.worker, event.file);
			send({
				type: "worker",
				worker: { name: event.worker, status: "busy", file },
			});
		}
	});

	const tw = await loadTwModules();
	await tw.provider.setProvider("modalv2");
	const { SERVER_PORT, WARM_SANDBOX_PREFIX } = tw.constants;

	const abort = new AbortController();
	const signal = abort.signal;
	const sandboxes: ProviderSandbox[] = [];
	const svixAppIds: string[] = [];
	let teardownPromise: Promise<void> | undefined;

	teardown = () => {
		teardownPromise ??= (async () => {
			send({ type: "phase", phase: "tearing_down" });
			const limit = pLimit(16);
			await Promise.all([
				...sandboxes.map((sandbox) =>
					limit(() => timeBoxed(() => tw.provider.deleteSandbox(sandbox))),
				),
				...svixAppIds.map((appId) =>
					limit(() => timeBoxed(() => tw.run.deleteSvixApp(appId))),
				),
			]);
		})();
		return teardownPromise;
	};
	const track = (sandbox: ProviderSandbox) => {
		sandboxes.push(sandbox);
		if (sandbox.id) send({ type: "sandbox", sandboxId: sandbox.id });
		if (teardownPromise)
			void timeBoxed(() => tw.provider.deleteSandbox(sandbox));
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
		workers: init.accounts.length,
		normalFileCount: normalFiles.length,
		svixFileCount: svixFiles.length,
	});
	const budget = stripeBudgetForRun({
		workers: totalWorkers,
		keys: new Set(
			init.accounts.slice(0, totalWorkers).map((account) => account.secretKey),
		).size,
	});
	send({ type: "phase", phase: "provisioning", workerCount: totalWorkers });

	const provision = async (idx: number) => {
		const account = init.accounts[idx];
		const name = `tw-twd-${init.runId}-${idx}`;
		const isSvixShard = idx < svixWorkers;
		setWorkerStatus(name, "provisioning");
		try {
			let svixAppId: string | undefined;
			if (isSvixShard) {
				svixAppId = await tw.svix.createSvixApp(tw.testOrg.TEST_ORG_CONFIG.id);
				svixAppIds.push(svixAppId);
			}
			const sandbox = await tw.provider.forkWorker({
				sourceSandbox: warmName,
				name,
				env: {
					...tw.run.buildWorkerEnv({
						stripeAccountId: account.accountId,
						stripeSecretKey: account.secretKey,
						isSvixShard,
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
			});
			track(sandbox);
			const publicUrl = await tw.provider.getPublicUrl(sandbox, SERVER_PORT);
			await tw.run.waitForReady({ sandbox, name, signal });
			await tw.ingress.pushWorkerMapping({
				ingressUrl: init.ingressUrl,
				token: init.ingressToken,
				accountId: account.accountId,
				workerUrl: publicUrl,
			});
			const handle: WorkerHandle = {
				name,
				sandboxId: sandbox.name,
				publicUrl,
				accountId: account.accountId,
				isSvixShard,
				inFlight: 0,
			};
			return { handle, sandbox };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			setWorkerStatus(name, "failed", reason.slice(0, 300));
			throw error;
		}
	};

	const settled = await Promise.allSettled(
		Array.from({ length: totalWorkers }, (_, idx) => provision(idx)),
	);
	const provisioned = settled.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : [],
	);
	const firstFailure = settled.find((result) => result.status === "rejected");
	if (provisioned.length === 0) {
		throw new Error(
			`all ${totalWorkers} worker(s) failed to provision (first: ${
				firstFailure?.status === "rejected" ? String(firstFailure.reason) : "?"
			})`,
		);
	}

	const sandboxByName = new Map(
		provisioned.map(({ handle, sandbox }) => [handle.name, sandbox]),
	);
	const resolveSandbox = (worker: WorkerHandle) =>
		sandboxByName.get(worker.name);
	const svixHandles = provisioned
		.filter(({ handle }) => handle.isSvixShard)
		.map(({ handle }) => handle);
	const normalHandles = provisioned
		.filter(({ handle }) => !handle.isSvixShard)
		.map(({ handle }) => handle);
	if (svixFiles.length > 0 && svixHandles.length === 0) {
		throw new Error("no Svix workers provisioned; cannot run the Svix tests");
	}
	if (normalFiles.length > 0 && normalHandles.length === 0) {
		throw new Error("no normal workers provisioned; cannot run the tests");
	}

	const withGrep = (executor: TestExecutor): TestExecutor =>
		init.grep
			? {
					run: (args) =>
						executor.run({ ...args, failedTestNames: [init.grep ?? ""] }),
				}
			: executor;
	const svixPool = new tw.pool.WorkerPool(svixHandles, 1);
	const normalPool = new tw.pool.WorkerPool(normalHandles, 1);
	const stopCulling = tw.run.startCulling(normalPool, resolveSandbox);

	const lastSent = new Map<string, string>();
	const flushFiles = () => {
		for (const tuiFile of getTuiState().files.values()) {
			const { file, final } = toRunFile(tuiFile);
			const key = JSON.stringify(file);
			if (lastSent.get(file.file) === key) continue;
			lastSent.set(file.file, key);
			send({ type: "file", file, final });
			if (file.status !== "running") {
				for (const [worker, current] of workerFile) {
					if (current !== tuiFile.file) continue;
					workerFile.delete(worker);
					send({
						type: "worker",
						worker: { name: worker, status: "ready", file: null },
					});
				}
			}
		}
	};
	const poll = setInterval(flushFiles, FILE_POLL_MS);

	send({ type: "phase", phase: "running" });
	try {
		await runShardTests({
			shards: [
				{
					files: svixFiles,
					executor: withGrep(
						new tw.remoteExecutor.RemoteExecutor({
							pool: svixPool,
							resolveSandbox,
							toWorkerPath: tw.run.toSandboxPath,
						}),
					),
					maxParallel: Math.max(1, svixHandles.length),
				},
				{
					files: normalFiles,
					executor: withGrep(
						new tw.remoteExecutor.RemoteExecutor({
							pool: normalPool,
							resolveSandbox,
							toWorkerPath: tw.run.toSandboxPath,
						}),
					),
					maxParallel: Math.max(1, normalHandles.length),
				},
			],
		});
	} finally {
		clearInterval(poll);
		flushFiles();
		stopCulling();
		svixPool.close();
		normalPool.close();
	}
};

process.once("message", (init: SwarmInit) => {
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
