/**
 * Freestyle backend for the provider seam (helpers/provider.ts) — `--provider=freestyle`.
 *
 * The differentiator vs Modal/Vercel is MEMORY snapshots: `snapshotAndStop`
 * captures the warm parent with PG + Dragonfly + goaws AND the Autumn server +
 * SQS workers + cron all RUNNING. Every worker restores already serving; boot is
 * swapped for freestyleBoot.ts (bind-only: svix/stripe DB binds + the pool-key
 * file the initMasterStripe seam reads) — seconds to READY, no process startup.
 *
 * ## Lifecycle mapping
 *   - **createWarmSandbox** — `vms.create()` (fresh Debian) → clone repo @ ref →
 *     run `image/freestyle-base.sh` (apt PG18/Dragonfly/goaws/bun into the same
 *     /opt/autumn-tw layout as build-base.sh, so warmup/start/stop/boot run
 *     unchanged). run.ts then streams warmup.sh as usual.
 *   - **snapshotAndStop** — restart services (warmup clean-stopped them), wait for
 *     their ports, then `vm.snapshot({name})` (memory+disk, account-wide named →
 *     cross-run + cross-teammate warm cache), then delete the parent VM.
 *   - **getSandboxByName** — live map, else NAMED SNAPSHOT lookup (the warm cache
 *     hit path: run.ts only needs truthiness + the name).
 *   - **forkWorker** — `vms.create({snapshotId})` with 429 backoff (the platform's
 *     "Quota burst allowance" admits ~22 instantly then refills; measured 163
 *     restores → healthy in 66s). Ephemeral persistence + idle timeout self-clean
 *     leaked workers.
 *   - **exec** — freestyle's REST exec is BUFFERED (no streaming, no env param):
 *     runStreaming delivers output as one chunk at the end (heartbeat keeps the
 *     terminal alive); env rides an on-VM env file every exec sources.
 *   - **runDetached** — nohup + pid/exit files + a polling log pump that feeds
 *     onChunk until the READY sentinel, then slows to a liveness poll.
 *   - **getPublicUrl** — `domains.mappings.create` on `<name>.style.dev` (auto
 *     HTTPS; the inbound Stripe webhook target).
 */
import chalk from "chalk";
import { Freestyle } from "freestyle";
import {
	DATABASE_CRITICAL_URL,
	DATABASE_URL,
	EDGE_CONFIG_OVERRIDE_B64,
	INGRESS_PORT,
	REDIS_URL,
	SERVER_PORT,
	SQS_QUEUE_URL_V2,
	TRACK_SQS_QUEUE_URL,
	WORKER_TIMEOUT_MS,
} from "../constants.ts";
import { READY_SENTINEL } from "../worker/boot.ts";
import { narrate, sink } from "./logSink.ts";
import type {
	CreateSandboxOptions,
	DetachedCommand,
	ForkWorkerOptions,
	GitSource,
	ListedSandbox,
	ProviderImpl,
	ProviderSandbox,
	RunDetachedOptions,
	RunStreamingOptions,
	RunStreamingResult,
} from "./provider.ts";

type Vm = ReturnType<Freestyle["vms"]["ref"]>;

const REPO_ROOT = "/repo";
const TW_PREFIX = "/opt/autumn-tw";
/** Per-VM env file every exec sources (freestyle exec has no env param). */
const VM_ENV_FILE = "/root/tw-vm.env";
const BASE_SCRIPT = `${REPO_ROOT}/scripts/tw/image/freestyle-base.sh`;
const START_SERVICES = `${REPO_ROOT}/scripts/tw/image/start-services.sh`;
/** boot.ts is swapped for this in runDetached: forks resume a RUNNING server,
 * so only per-worker binds run (see worker/freestyleBoot.ts). */
const FREESTYLE_BOOT_SCRIPT = "scripts/tw/worker/freestyleBoot.ts";
const STRIPE_KEY_FILE = "/opt/autumn-tw/worker-stripe-key";
const WARM_SERVER_HEALTH_TIMEOUT_S = 180;
/** Long enough for apt + initdb on the cold path; execs are buffered. */
const EXEC_TIMEOUT_MS = 15 * 60 * 1000;
/** Patience for create-from-snapshot 429 backoff (quota bucket refill). */
const CREATE_DEADLINE_MS = 5 * 60 * 1000;
const INGRESS_IDLE_TIMEOUT_S = 3600;

const freestyleApiKey = (): string => {
	const key = process.env.FREESTYLE_API_KEY;
	if (!key) {
		throw new Error(
			"freestyle: FREESTYLE_API_KEY is not set — run under `infisical run --env=dev` (do NOT use a personal key)",
		);
	}
	return key;
};

let clientInstance: Freestyle | undefined;
const client = (): Freestyle => {
	clientInstance ??= new Freestyle({ apiKey: freestyleApiKey() });
	return clientInstance;
};

const secs = (ms: number): string => (ms / 1000).toFixed(1);
const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Timed stage breadcrumb with optional heartbeat (same UX as modal.ts). */
const stage = (label: string, heartbeatMs?: number): (() => void) => {
	const startedAt = Date.now();
	narrate(chalk.cyan(`[freestyle] ▸ ${label}`));
	const ticker =
		heartbeatMs === undefined
			? undefined
			: setInterval(() => {
					narrate(
						chalk.cyan.dim(
							`[freestyle]   … ${label} — still running (+${secs(Date.now() - startedAt)}s)`,
						),
					);
				}, heartbeatMs);
	return () => {
		if (ticker) {
			clearInterval(ticker);
		}
		narrate(
			chalk.cyan(`[freestyle] ✓ ${label} (+${secs(Date.now() - startedAt)}s)`),
		);
	};
};

// ---- in-process state ------------------------------------------------------
const liveVms = new Map<string, { vm: Vm; vmId: string }>();
const snapshotIdByName = new Map<string, string>();
/** Domains we mapped, keyed by sandbox name/id — deleted with the sandbox. */
const domainsBySandbox = new Map<string, string>();
/** Warm VMs fast-forwarded from an older snapshot → that source snapshot id,
 * so a failed warmup on it poisons (deletes) the source instead of wedging. */
const ffSourceByWarmName = new Map<string, string>();
const WARM_NAME_PREFIX = "tw-warm-";
/** Rolling GC keeps this many newest warm snapshots (current + one fallback). */
const WARM_SNAPSHOTS_TO_KEEP = 2;

const wrap = (name: string, vm: Vm, vmId: string): ProviderSandbox => ({
	name,
	handle: vm,
	id: vmId,
});
const unwrap = (sandbox: ProviderSandbox): Vm => sandbox.handle as Vm;

const shellQuote = (part: string): string => `'${part.replace(/'/g, `'\\''`)}'`;
const argvToCommand = (argv: string[]): string =>
	argv.map(shellQuote).join(" ");

/** Every exec: restore HOME (freestyle exec omits it) + source the VM env file. */
const withVmEnv = (command: string): string =>
	`export HOME="\${HOME:-/root}"; set -a; [ -f ${VM_ENV_FILE} ] && . ${VM_ENV_FILE}; set +a; ${command}`;

const envFileContent = (env: Record<string, string>): string =>
	`${Object.entries(env)
		.map(([key, value]) => `${key}=${shellQuote(value)}`)
		.join("\n")}\n`;

const execOnVm = async (
	vm: Vm,
	command: string,
	timeoutMs = EXEC_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
	const res = await vm.exec({ command: withVmEnv(command), timeoutMs });
	return {
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
		exitCode: Number(res.statusCode ?? 0),
	};
};

const is429 = (error: unknown): boolean =>
	/429|burst allowance|rate.?limit/i.test(
		error instanceof Error ? error.message : String(error),
	);

/** `vms.create` with patient jittered backoff against the burst quota. */
const createVmWithBackoff = async (options: {
	snapshotId?: string;
	name: string;
	idleTimeoutSeconds?: number | null;
	ephemeral?: boolean;
	signal?: AbortSignal;
}): Promise<{ vm: Vm; vmId: string }> => {
	const deadline = Date.now() + CREATE_DEADLINE_MS;
	for (let attempt = 0; ; attempt++) {
		options.signal?.throwIfAborted();
		try {
			const created = await client().vms.create({
				snapshotId: options.snapshotId ?? null,
				name: options.name,
				idleTimeoutSeconds: options.idleTimeoutSeconds,
				persistence: options.ephemeral ? { type: "ephemeral" } : undefined,
			});
			return { vm: created.vm, vmId: created.vmId };
		} catch (error) {
			if (!is429(error) || Date.now() > deadline) {
				throw error;
			}
			await sleep(400 + Math.random() * 800 * Math.min(attempt + 1, 8));
		}
	}
};

/** The env the SNAPSHOTTED server runs with. Per-worker identity (pool key,
 * sub-account, svix) arrives later via the key-file seam + DB binds. */
const warmServerEnv = (): Record<string, string> => {
	const requireSecret = (name: string): string => {
		const value = process.env[name];
		if (!value) {
			throw new Error(`freestyle: missing secret ${name} in orchestrator env`);
		}
		return value;
	};
	const placeholderKey =
		process.env.STRIPE_TEST_KEY_POOL?.split(",")[0]?.trim() ||
		requireSecret("STRIPE_SANDBOX_SECRET_KEY");
	const env: Record<string, string> = {
		NODE_ENV: "development",
		SERVER_PORT: String(SERVER_PORT),
		DATABASE_URL,
		DATABASE_CRITICAL_URL,
		BETTER_AUTH_URL: `http://localhost:${SERVER_PORT}`,
		REDIS_URL,
		CACHE_URL: REDIS_URL,
		CACHE_V2_DRAGONFLY_URL: REDIS_URL,
		SQS_QUEUE_URL_V2,
		TRACK_SQS_QUEUE_URL,
		ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
		ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
		BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
		STRIPE_SANDBOX_SECRET_KEY: placeholderKey,
		STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_tw_skipverify",
		AUTUMN_DB_DIRECT: "1",
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: EDGE_CONFIG_OVERRIDE_B64,
		TW_WORKER_MODE: "1",
	};
	// Baked unconditionally: only the svix shard binds an app, so it's inert
	// on every other worker but present when that shard's server sends.
	if (process.env.SVIX_API_KEY) {
		env.SVIX_API_KEY = process.env.SVIX_API_KEY;
	}
	return env;
};

const cloneUrl = (source: GitSource): string =>
	source.username && source.password
		? source.url.replace(
				/^https:\/\//,
				`https://${encodeURIComponent(source.username)}:${encodeURIComponent(source.password)}@`,
			)
		: source.url;

const cloneRepo = async (vm: Vm, source: GitSource): Promise<void> => {
	const done = stage(`clone repo @ ${source.revision}`, 20_000);
	const res = await execOnVm(
		vm,
		[
			"set -e",
			`rm -rf ${REPO_ROOT}`,
			`git clone ${cloneUrl(source)} ${REPO_ROOT}`,
			`git -C ${REPO_ROOT} checkout ${source.revision}`,
		].join(" && "),
	);
	done();
	if (res.exitCode !== 0) {
		throw new Error(
			`freestyle: git clone failed (exit ${res.exitCode}): ${res.stderr.slice(-1500)}`,
		);
	}
};

/** Newest READY warm snapshot (any ref) — the rolling fast-forward base. */
const latestWarmSnapshot = async (): Promise<
	{ snapshotId: string; name: string } | undefined
> => {
	const { snapshots } = await client().vms.snapshots.list();
	const match = snapshots
		.filter(
			(snap) =>
				snap.name?.startsWith(WARM_NAME_PREFIX) &&
				!snap.deleted &&
				snap.state === "ready",
		)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
	return match?.name
		? { snapshotId: match.snapshotId, name: match.name }
		: undefined;
};

/** Best-effort snapshot delete (the SDK exposes list/get only). */
const deleteSnapshot = async (snapshotId: string): Promise<void> => {
	await client()
		.fetch(`/v1/vms/snapshots/${snapshotId}`, { method: "DELETE" })
		.catch(() => {
			/* best-effort */
		});
	for (const [name, id] of snapshotIdByName) {
		if (id === snapshotId) {
			snapshotIdByName.delete(name);
		}
	}
};

/** Rolling GC: keep the newest N warm snapshots, delete the rest. */
const gcWarmSnapshots = async (): Promise<void> => {
	const { snapshots } = await client().vms.snapshots.list();
	const warm = snapshots
		.filter(
			(snap) =>
				snap.name?.startsWith(WARM_NAME_PREFIX) &&
				!snap.deleted &&
				snap.state !== "failed",
		)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	for (const stale of warm.slice(WARM_SNAPSHOTS_TO_KEEP)) {
		narrate(
			chalk.cyan.dim(`[freestyle] gc: deleting old warm snapshot ${stale.name}`),
		);
		await deleteSnapshot(stale.snapshotId);
	}
};

/** Resolve a warm name to its snapshot id (in-process map, else named lookup). */
const findSnapshotByName = async (
	name: string,
): Promise<string | undefined> => {
	const local = snapshotIdByName.get(name);
	if (local) {
		return local;
	}
	const { snapshots } = await client().vms.snapshots.list();
	const match = snapshots
		.filter(
			(snap) =>
				snap.name === name && !snap.deleted && snap.state !== "failed",
		)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
	if (match) {
		snapshotIdByName.set(name, match.snapshotId);
	}
	return match?.snapshotId;
};

/** Sandbox names are valid *.style.dev labels apart from case/underscores. */
const domainForName = (name: string): string =>
	`${name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60)}.style.dev`;

const isSandboxStreamClosed = (error: unknown): boolean =>
	/VM_NOT_RUNNING|VM_DELETED|VmDeleted|VmNotRunning|not running|deleted|EXEC_TIMED_OUT|IsSuspending|suspended/i.test(
		error instanceof Error ? error.message : String(error),
	);

export const freestyleProvider: ProviderImpl = {
	async createWarmSandbox(opts: CreateSandboxOptions): Promise<ProviderSandbox> {
		if (!opts.source) {
			throw new Error("freestyle: createWarmSandbox requires a git source");
		}

		// Rolling fast-forward: restore the newest warm snapshot (any ref) and let
		// run.ts's normal warmup.sh fast-forward it — checkout + delta install +
		// migrate (self-repairing) + seed. New-commit warm cost drops from a full
		// cold build (~8 min) to roughly checkout + restart + re-snapshot (~2-3 min).
		const rollingBase = await latestWarmSnapshot().catch(() => undefined);
		if (rollingBase) {
			const ffDone = stage(
				`fast-forward warm ${opts.name} from ${rollingBase.name}`,
			);
			try {
				const { vm, vmId } = await createVmWithBackoff({
					snapshotId: rollingBase.snapshotId,
					name: opts.name,
					idleTimeoutSeconds: 3600,
					signal: opts.signal,
				});
				// The resumed app procs hold ports + run OLD code; warmup restarts state.
				await execOnVm(
					vm,
					"pkill -f 'bun src/index.ts' || true; pkill -f 'bun src/workers.ts' || true; pkill -f 'bun src/cron.ts' || true",
					30_000,
				);
				// Check out the TARGET ref before run.ts invokes warmup.sh — otherwise
				// the OLD commit's warmup runs (and gets swapped mid-execution by its
				// own checkout step).
				const checkout = await execOnVm(
					vm,
					`cd ${REPO_ROOT} && git fetch --quiet ${cloneUrl(opts.source)} ${shellQuote(opts.source.revision)} && git checkout --quiet --force FETCH_HEAD`,
					120_000,
				);
				if (checkout.exitCode !== 0) {
					throw new Error(
						`fast-forward checkout failed: ${checkout.stderr.slice(-500)}`,
					);
				}
				liveVms.set(opts.name, { vm, vmId });
				liveVms.set(vmId, { vm, vmId });
				ffSourceByWarmName.set(opts.name, rollingBase.snapshotId);
				await vm.fs.writeTextFile(VM_ENV_FILE, envFileContent(opts.env));
				ffDone();
				return wrap(opts.name, vm, vmId);
			} catch (error) {
				ffDone();
				narrate(
					chalk.yellow(
						`[freestyle] fast-forward restore failed (${(error as Error).message?.slice(0, 120)}) — falling back to cold build`,
					),
				);
			}
		}

		const done = stage(`create warm VM ${opts.name} (cold build)`);
		const { vm, vmId } = await createVmWithBackoff({
			name: opts.name,
			// The warm build takes minutes of quiet exec time — don't let it suspend.
			idleTimeoutSeconds: 3600,
			signal: opts.signal,
		});
		liveVms.set(opts.name, { vm, vmId });
		liveVms.set(vmId, { vm, vmId });
		done();
		await vm.fs.writeTextFile(VM_ENV_FILE, envFileContent(opts.env));
		await cloneRepo(vm, opts.source);
		const baseDone = stage(
			"freestyle-base.sh (apt PG18 + Dragonfly + goaws + bun, ~2-3m)",
			20_000,
		);
		const base = await execOnVm(vm, `bash ${BASE_SCRIPT}`);
		baseDone();
		if (base.exitCode !== 0) {
			sink(base.stdout);
			sink(base.stderr);
			throw new Error(
				`freestyle: freestyle-base.sh failed (exit ${base.exitCode}): ${base.stderr.slice(-1500)}`,
			);
		}
		return wrap(opts.name, vm, vmId);
	},

	async createIngressSandbox(
		opts: CreateSandboxOptions,
	): Promise<ProviderSandbox> {
		// The ingress restores from the warm snapshot (bun + repo + services all
		// present) — a fresh Debian VM would need its own provisioning pass.
		const snapshotEntry = [...snapshotIdByName.entries()].at(-1);
		const done = stage(`create ingress ${opts.name}`);
		let vmRef: { vm: Vm; vmId: string };
		if (snapshotEntry) {
			vmRef = await createVmWithBackoff({
				snapshotId: snapshotEntry[1],
				name: opts.name,
				idleTimeoutSeconds: INGRESS_IDLE_TIMEOUT_S,
				ephemeral: true,
				signal: opts.signal,
			});
			// The snapshot's resumed Autumn app holds :8080 — the ingress needs it.
			await execOnVm(
				vmRef.vm,
				"pkill -f 'bun src/index.ts' || true; pkill -f 'bun src/workers.ts' || true; pkill -f 'bun src/cron.ts' || true",
				30_000,
			);
		} else {
			if (!opts.source) {
				throw new Error(
					"freestyle: no warm snapshot and no git source for the ingress",
				);
			}
			vmRef = await createVmWithBackoff({
				name: opts.name,
				idleTimeoutSeconds: INGRESS_IDLE_TIMEOUT_S,
				ephemeral: true,
				signal: opts.signal,
			});
			await cloneRepo(vmRef.vm, opts.source);
		}
		liveVms.set(opts.name, vmRef);
		liveVms.set(vmRef.vmId, vmRef);
		done();
		await vmRef.vm.fs.writeTextFile(VM_ENV_FILE, envFileContent(opts.env));
		return wrap(opts.name, vmRef.vm, vmRef.vmId);
	},

	async forkWorker(opts: ForkWorkerOptions): Promise<ProviderSandbox> {
		const snapshotId = await findSnapshotByName(opts.sourceSandbox);
		if (!snapshotId) {
			throw new Error(
				`freestyle: no warm snapshot named "${opts.sourceSandbox}" — snapshotAndStop must run first`,
			);
		}
		const { vm, vmId } = await createVmWithBackoff({
			snapshotId,
			name: opts.name,
			idleTimeoutSeconds: Math.ceil(
				(opts.timeout ?? WORKER_TIMEOUT_MS) / 1000,
			),
			ephemeral: true,
			signal: opts.signal,
		});
		liveVms.set(opts.name, { vm, vmId });
		liveVms.set(vmId, { vm, vmId });
		// Per-worker env (its pool Stripe key, sub-account, svix flags) replaces the
		// warm parent's env file baked into the snapshot.
		await vm.fs.writeTextFile(VM_ENV_FILE, envFileContent(opts.env));
		return wrap(opts.name, vm, vmId);
	},

	async snapshotAndStop(sandbox: ProviderSandbox): Promise<string> {
		const vm = unwrap(sandbox);
		// warmup.sh clean-stopped the services for filesystem-snapshot providers;
		// for a MEMORY snapshot we want them RUNNING so forks skip service boot.
		const startDone = stage("restart services for the live snapshot");
		const start = await execOnVm(vm, `bash ${START_SERVICES}`);
		startDone();
		if (start.exitCode !== 0) {
			throw new Error(
				`freestyle: start-services before snapshot failed (exit ${start.exitCode}): ${start.stderr.slice(-1500)}`,
			);
		}

		// Playwright Chromium for the browser-driven groups (same bake as Modal's
		// image step 9; needs the repo's node_modules, so it runs post-warmup).
		const chromiumDone = stage("bake Playwright Chromium (browser groups)", 20_000);
		const chromium = await execOnVm(
			vm,
			`cd ${REPO_ROOT} && PWV=$(bun -p "require('playwright-core/package.json').version" 2>/dev/null || echo 1.60.0) && ` +
				"apt-get update -qq && bun x playwright@$PWV install --with-deps chromium",
		);
		chromiumDone();
		if (chromium.exitCode !== 0) {
			throw new Error(
				`freestyle: chromium bake failed (exit ${chromium.exitCode}): ${chromium.stderr.slice(-1500)}`,
			);
		}

		// Bake the RUNNING app into the snapshot: server + SQS workers + cron start
		// here once, so forks resume them instead of paying ~30s of bun startup each.
		const serverEnv = warmServerEnv();
		await vm.fs.writeTextFile(VM_ENV_FILE, envFileContent(serverEnv));
		const appDone = stage("start server + workers + cron in the warm parent", 20_000);
		// Canonically clean cache slate for every fork (clearMasterOrg tail, local-only
		// dragonfly) happens after health, right before the snapshot.
		const appStart = await execOnVm(
			vm,
			[
				"set -e",
				`mkdir -p ${TW_PREFIX}/logs`,
				`printf '%s' ${shellQuote(serverEnv.STRIPE_SANDBOX_SECRET_KEY)} > ${STRIPE_KEY_FILE}`,
				`chmod 600 ${STRIPE_KEY_FILE}`,
				`cd ${REPO_ROOT}/server`,
				`nohup bun src/index.ts > ${TW_PREFIX}/logs/server.log 2>&1 &`,
				`nohup bun src/workers.ts > ${TW_PREFIX}/logs/workers.log 2>&1 &`,
				`nohup bun src/cron.ts > ${TW_PREFIX}/logs/cron.log 2>&1 &`,
				'code=""',
				`for i in $(seq 1 ${WARM_SERVER_HEALTH_TIMEOUT_S * 2}); do code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:${SERVER_PORT}/ || true); [ "$code" = 200 ] && break; sleep 0.5; done`,
				`[ "$code" = 200 ] || { echo "server never became healthy (last=$code)"; tail -40 ${TW_PREFIX}/logs/server.log; exit 1; }`,
				"redis-cli -p 6379 flushall",
			].join("\n"),
		);
		appDone();
		if (appStart.exitCode !== 0) {
			throw new Error(
				`freestyle: warm app start failed (exit ${appStart.exitCode}): ${(appStart.stdout + appStart.stderr).slice(-2000)}`,
			);
		}

		const done = stage("memory-snapshot warm parent (services + server running)", 15_000);
		try {
			const snap = await vm.snapshot({ name: sandbox.name });
			snapshotIdByName.set(sandbox.name, snap.snapshotId);
			ffSourceByWarmName.delete(sandbox.name);
			await vm.delete().catch(() => {
				/* best-effort */
			});
			liveVms.delete(sandbox.name);
			if (sandbox.id) {
				liveVms.delete(sandbox.id);
			}
			// The new snapshot is live — retire old generations (keep a fallback).
			await gcWarmSnapshots().catch(() => {
				/* best-effort */
			});
			return snap.snapshotId;
		} finally {
			done();
		}
	},

	async getPublicUrl(sandbox: ProviderSandbox, port: number): Promise<string> {
		const existing = domainsBySandbox.get(sandbox.name);
		if (existing) {
			return `https://${existing}`;
		}
		if (!sandbox.id) {
			throw new Error(`freestyle: no vmId for ${sandbox.name}`);
		}
		const domain = domainForName(sandbox.name);
		await client().domains.mappings.create({
			domain,
			vmId: sandbox.id,
			vmPort: port,
		});
		domainsBySandbox.set(sandbox.name, domain);
		if (port !== SERVER_PORT && port !== INGRESS_PORT) {
			narrate(
				chalk.yellow(`[freestyle] mapped non-standard port ${port} for ${sandbox.name}`),
			);
		}
		return `https://${domain}`;
	},

	async getSandboxByName(name: string): Promise<ProviderSandbox | undefined> {
		const local = liveVms.get(name);
		if (local) {
			return wrap(name, local.vm, local.vmId);
		}
		// Warm cache hit: a READY named snapshot counts as "the warm parent exists"
		// (run.ts only needs truthiness; forkWorker resolves the same name).
		const snapshotId = await findSnapshotByName(name);
		if (snapshotId) {
			return { name, handle: undefined, id: undefined };
		}
		return undefined;
	},

	async deleteSandbox(sandboxOrName: ProviderSandbox | string): Promise<void> {
		const key =
			typeof sandboxOrName === "string"
				? sandboxOrName
				: (sandboxOrName.id ?? sandboxOrName.name);
		const names =
			typeof sandboxOrName === "string"
				? [sandboxOrName]
				: [sandboxOrName.name, sandboxOrName.id ?? ""];
		for (const name of names) {
			const domain = domainsBySandbox.get(name);
			if (domain) {
				await client()
					.domains.mappings.delete({ domain })
					.catch(() => {
						/* already gone */
					});
				domainsBySandbox.delete(name);
			}
		}
		const local = liveVms.get(key);
		const vmId = local?.vmId ?? key;
		await client()
			.vms.delete({ vmId })
			.catch(() => {
				/* already gone / a name that never mapped to a vm */
			});
		for (const name of names) {
			liveVms.delete(name);
		}
		liveVms.delete(vmId);
	},

	async runStreaming(
		sandbox: ProviderSandbox,
		argv: string[],
		onChunk: (text: string) => void,
		opts?: RunStreamingOptions,
	): Promise<RunStreamingResult> {
		const vm = unwrap(sandbox);
		const envPrefix = opts?.env
			? `${Object.entries(opts.env)
					.map(([key, value]) => `export ${key}=${shellQuote(value)};`)
					.join(" ")} `
			: "";
		// Buffered exec: output arrives as ONE chunk at the end. Only long-lived
		// script runs (warmup/build — bash argv) get a narrated heartbeat; per-file
		// `bun test` execs stay silent like the other providers.
		const isScriptRun = argv[0] === "bash";
		const done = isScriptRun
			? stage(`exec ${argv.slice(0, 2).join(" ")}`, 20_000)
			: undefined;
		try {
			const res = await execOnVm(
				vm,
				`cd ${REPO_ROOT} && ${envPrefix}${argvToCommand(argv)}`,
			);
			onChunk(res.stdout);
			if (res.stderr) {
				onChunk(res.stderr);
			}
			// A failed warmup on a fast-forwarded base poisons its SOURCE snapshot —
			// otherwise every future run repeats the same broken fast-forward.
			const ffSource = ffSourceByWarmName.get(sandbox.name);
			if (
				res.exitCode !== 0 &&
				ffSource &&
				argv.some((part) => part.endsWith("warmup.sh"))
			) {
				narrate(
					chalk.yellow(
						`[freestyle] warmup failed on fast-forwarded base — deleting source snapshot ${ffSource} (next run cold-builds)`,
					),
				);
				await deleteSnapshot(ffSource);
				ffSourceByWarmName.delete(sandbox.name);
			}
			return { exitCode: res.exitCode, stderr: res.stderr };
		} catch (error) {
			if (opts?.swallowStreamClose && isSandboxStreamClosed(error)) {
				return { exitCode: 0, stderr: "" };
			}
			throw error;
		} finally {
			done?.();
		}
	},

	async runDetached(
		sandbox: ProviderSandbox,
		argv: string[],
		opts: RunDetachedOptions,
	): Promise<DetachedCommand> {
		const vm = unwrap(sandbox);
		// The snapshot resumes a RUNNING server — boot.ts would EADDRINUSE on 8080.
		// Swap in the prebooted bind-only boot (all divergence lives freestyle-side).
		if (argv[1]?.endsWith("worker/boot.ts")) {
			argv = [argv[0], FREESTYLE_BOOT_SCRIPT, ...argv.slice(2)];
		}
		const tag = Math.random().toString(36).slice(2, 8);
		const logFile = `${TW_PREFIX}/logs/detached-${tag}.log`;
		const pidFile = `${TW_PREFIX}/logs/detached-${tag}.pid`;
		const exitFile = `${TW_PREFIX}/logs/detached-${tag}.exit`;
		const cwd = opts.cwd ?? REPO_ROOT;
		const inner = `cd ${shellQuote(cwd)} && ${argvToCommand(argv)}; echo $? > ${exitFile}`;
		const launch = await execOnVm(
			vm,
			`mkdir -p ${TW_PREFIX}/logs && rm -f ${logFile} ${pidFile} ${exitFile} && ` +
				`nohup bash -c ${shellQuote(withVmEnv(inner))} > ${logFile} 2>&1 & echo $! > ${pidFile}`,
			60_000,
		);
		if (launch.exitCode !== 0) {
			throw new Error(
				`freestyle: detached launch failed (exit ${launch.exitCode}): ${launch.stderr.slice(-800)}`,
			);
		}

		// Polling log pump: buffered exec can't stream, so tail the log by byte
		// offset. Fast (1.5s) until the process exits or the caller stops caring
		// (run.ts stops consuming after READY); the pump itself never rejects.
		let offset = 0;
		let exited: { exitCode: number } | undefined;
		let readySeen = false;
		const exitWaiters: ((result: { exitCode: number }) => void)[] = [];
		let stopped = false;
		const poll = async (): Promise<void> => {
			while (!stopped && !exited) {
				opts.signal?.throwIfAborted?.();
				try {
					const res = await execOnVm(
						vm,
						`tail -c +${offset + 1} ${logFile} 2>/dev/null | head -c 200000; ` +
							`printf '\\n__TW_EOF__'; [ -f ${exitFile} ] && printf 'EXIT=%s' "$(cat ${exitFile})"`,
						30_000,
					);
					const [body, marker] = res.stdout.split("\n__TW_EOF__");
					if (body) {
						offset += Buffer.byteLength(body, "utf8");
						opts.onChunk(body);
						if (body.includes(READY_SENTINEL)) {
							readySeen = true;
						}
					}
					const exitMatch = marker?.match(/EXIT=(\d+)/);
					if (exitMatch) {
						exited = { exitCode: Number(exitMatch[1]) };
						for (const resolve of exitWaiters.splice(0)) {
							resolve(exited);
						}
						return;
					}
				} catch (error) {
					if (isSandboxStreamClosed(error)) {
						exited = { exitCode: 137 };
						for (const resolve of exitWaiters.splice(0)) {
							resolve(exited);
						}
						return;
					}
					// transient exec fault — keep polling
				}
				// Fast until READY (run.ts is watching for the sentinel); slow liveness
				// poll after — 200 workers × 1.5s for a whole run would hammer the API.
				await sleep(
					readySeen ? 20_000 + Math.random() * 5_000 : 1_500 + Math.random() * 500,
				);
			}
		};
		void poll().catch(() => {
			stopped = true;
		});

		return {
			wait: async (waitOpts?: { signal?: AbortSignal }) => {
				if (exited) {
					return exited;
				}
				return new Promise<{ exitCode: number }>((resolve, reject) => {
					exitWaiters.push(resolve);
					waitOpts?.signal?.addEventListener("abort", () => {
						stopped = true;
						reject(new Error("freestyle: detached wait aborted"));
					});
				});
			},
		};
	},

	async listSandboxesByOwner(): Promise<ListedSandbox[]> {
		// The list API carries no tags/names — cross-run enumeration relies on the
		// run registry (vmIds) + ephemeral persistence / idle-timeout self-cleanup,
		// same trade-off as modalv2.
		return [];
	},

	isSandboxStreamClosed,
};
