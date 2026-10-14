import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import {
	type App,
	type Image,
	type Logger,
	ModalClient,
	type Sandbox,
} from "modal";
import {
	INGRESS_PORT,
	PROJECT_ROOT,
	SERVER_PORT,
	WARM_SANDBOX_PREFIX,
	WORKER_TIMEOUT_MS,
} from "../constants.ts";
import { narrate, sink } from "./logSink.ts";
import {
	type BaseImageDeps,
	buildBaseImage,
	buildIngressImage,
} from "./modalImage.ts";
import { modalRegions } from "./modalRegion.ts";
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
	SnapshotAndStopOptions,
} from "./provider.ts";

const MODAL_REPO_ROOT = "/repo";
const APP_NAME = "autumn-tw";
const WORKER_CPU = Number(process.env.TW_MODAL_WORKER_CPU ?? 2);
const WORKER_MEMORY_MIB = Number(process.env.TW_MODAL_WORKER_MEM_MIB ?? 4096);
const INGRESS_MEMORY_MIB = 1024;
const SNAPSHOT_TIMEOUT_MS = 10 * 60 * 1000;

const secs = (ms: number): string => (ms / 1000).toFixed(1);

const stage = (label: string, heartbeatMs?: number): (() => void) => {
	const startedAt = Date.now();
	narrate(chalk.magenta(`[modal] ▸ ${label}`));
	const ticker =
		heartbeatMs === undefined
			? undefined
			: setInterval(() => {
					narrate(
						chalk.magenta.dim(
							`[modal]   … ${label} — still running (+${secs(Date.now() - startedAt)}s)`,
						),
					);
				}, heartbeatMs);
	return () => {
		if (ticker) {
			clearInterval(ticker);
		}
		narrate(
			chalk.magenta(`[modal] ✓ ${label} (+${secs(Date.now() - startedAt)}s)`),
		);
	};
};

const sdkLogger: Logger = {
	debug: (message: string) => sink(chalk.dim(`[modal-sdk] ${message}\n`)),
	info: (message: string) => narrate(chalk.dim(`[modal-sdk] ${message}`)),
	warn: (message: string) => narrate(chalk.yellow(`[modal-sdk] ${message}`)),
	error: (message: string) => narrate(chalk.red(`[modal-sdk] ${message}`)),
};

const modal = new ModalClient({ logger: sdkLogger, logLevel: "info" });

let appPromise: Promise<App> | undefined;
const getApp = (): Promise<App> => {
	appPromise ??= modal.apps.fromName(APP_NAME, { createIfMissing: true });
	return appPromise;
};

const cloneUrl = (source: GitSource): string =>
	source.username && source.password
		? source.url.replace(
				/^https:\/\//,
				`https://${encodeURIComponent(source.username)}:${encodeURIComponent(source.password)}@`,
			)
		: source.url;

const lockHash = (): string => {
	for (const name of ["bun.lock", "bun.lockb", "package-lock.json"]) {
		try {
			const buf = readFileSync(join(PROJECT_ROOT, name));
			return createHash("sha256").update(buf).digest("hex").slice(0, 16);
		} catch {}
	}
	return "nolock";
};

let baseImagePromise: Promise<Image> | undefined;
const getBaseImage = (deps: BaseImageDeps): Promise<Image> => {
	baseImagePromise ??= (async () => {
		const app = await getApp();
		const done = stage(
			"building base services image + node_modules (first run ~2-3m; cached after)",
			15_000,
		);
		try {
			return await buildBaseImage(modal, app, deps);
		} finally {
			done();
		}
	})();
	return baseImagePromise;
};

let ingressImagePromise: Promise<Image> | undefined;
const getIngressImage = (): Promise<Image> => {
	ingressImagePromise ??= (async () => {
		const app = await getApp();
		const done = stage(
			"building ingress image (debian + bun; cached after)",
			15_000,
		);
		try {
			return await buildIngressImage(modal, app);
		} finally {
			done();
		}
	})();
	return ingressImagePromise;
};

const warmImageByName = new Map<string, Image>();
const WARM_IMAGE_REPO = "tw-warm";
const WARM_IMAGE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const staleWarmNames = new Set<string>();
const STALE_WARM_DISABLED = process.env.TW_MODAL_NO_STALE === "1";

const warmShaFromName = (name: string): string | undefined =>
	name.startsWith(`${WARM_SANDBOX_PREFIX}-`)
		? name.slice(WARM_SANDBOX_PREFIX.length + 1)
		: undefined;

const lookupPublishedWarmImage = async (
	tag: string,
): Promise<Image | undefined> => {
	try {
		return await modal.images.fromName(`${WARM_IMAGE_REPO}:${tag}`);
	} catch {
		return undefined;
	}
};

const publishWarmImage = async ({
	image,
	sha12,
	shouldPublishLatest = () => false,
}: {
	image: Image;
	sha12: string;
	shouldPublishLatest?: () => boolean;
}): Promise<void> => {
	try {
		await image.publish(`${WARM_IMAGE_REPO}:${sha12}`);
		const publishLatest = shouldPublishLatest();
		if (publishLatest) {
			await image.publish(`${WARM_IMAGE_REPO}:latest`);
		}
		narrate(
			chalk.magenta(
				`[modal] published warm image ${WARM_IMAGE_REPO}:${sha12}${publishLatest ? " (+ :latest)" : ""} — next runs skip the warm build`,
			),
		);
	} catch (error) {
		narrate(
			chalk.yellow(
				`[modal] warm image publish failed (${(error as Error).message?.slice(0, 120)}) — this run still works; next run rebuilds warm`,
			),
		);
	}
};
const liveSandboxes = new Map<string, Sandbox>();

const wrap = (name: string, handle: Sandbox): ProviderSandbox => ({
	name,
	handle,
	id: handle.sandboxId,
});
const unwrap = (sandbox: ProviderSandbox): Sandbox => sandbox.handle as Sandbox;

const MODAL_REGIONS = modalRegions();

const tagsWithName = (
	name: string,
	tags: Record<string, string>,
): Record<string, string> => ({ ...tags, name });

const CREATE_BURST = 120;
const CREATE_MIN_INTERVAL_MS = 220;
let createCount = 0;
let paceChain: Promise<void> = Promise.resolve();
const sleep = (msDelay: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, msDelay));

const pace = (): Promise<void> => {
	if (createCount++ < CREATE_BURST) {
		return Promise.resolve();
	}
	paceChain = paceChain.then(() => sleep(CREATE_MIN_INTERVAL_MS));
	return paceChain;
};

const pumpStream = async <T extends string | Uint8Array>(
	stream: ReadableStream<T>,
	onText: (text: string) => void,
): Promise<void> => {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value !== undefined && value !== null) {
				onText(typeof value === "string" ? value : decoder.decode(value));
			}
		}
	} finally {
		reader.releaseLock();
	}
};

const isTransientExecError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	const code = (error as { code?: number })?.code;
	return (
		code === 14 ||
		/UNAVAILABLE|Name resolution failed|ECONNREFUSED|ECONNRESET|connection (closed|reset|refused)|deadline exceeded|temporarily unavailable|no healthy upstream/i.test(
			message,
		)
	);
};

const EXEC_RETRIES = 5;

const withExecRetry = async <T>(
	label: string,
	start: () => Promise<T>,
): Promise<T> => {
	for (let attempt = 0; ; attempt++) {
		try {
			return await start();
		} catch (error) {
			if (attempt >= EXEC_RETRIES || !isTransientExecError(error)) {
				throw error;
			}
			const delayMs =
				Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300);
			narrate(
				chalk.yellow(
					`[modal] ${label}: exec start failed transiently (${(error as Error).message?.slice(0, 70)}…) — retry ${attempt + 1}/${EXEC_RETRIES} in ${delayMs}ms`,
				),
			);
			await sleep(delayMs);
		}
	}
};

const cloneRepo = async (
	sandbox: Sandbox,
	source: GitSource,
): Promise<void> => {
	const url = cloneUrl(source);
	const script = [
		"set -e",
		"shopt -s dotglob nullglob",
		"rm -rf /tmp/twclone",
		`git clone ${url} /tmp/twclone`,
		`git -C /tmp/twclone checkout ${source.revision}`,
		`mkdir -p ${MODAL_REPO_ROOT}`,
		"for entry in /tmp/twclone/*; do",
		'  base=$(basename "$entry")',
		'  [ "$base" = "node_modules" ] && continue',
		`  rm -rf "${MODAL_REPO_ROOT}/$base"`,
		`  mv "$entry" "${MODAL_REPO_ROOT}/$base"`,
		"done",
		"rm -rf /tmp/twclone",
	].join("\n");
	const done = stage(`clone repo @ ${source.revision}`);
	const proc = await withExecRetry("clone", () =>
		sandbox.exec(["bash", "-lc", script], {
			stdout: "pipe",
			stderr: "pipe",
			workdir: "/",
		}),
	);
	let stderrText = "";
	await Promise.all([
		pumpStream(proc.stdout, (text) => sink(text)),
		pumpStream(proc.stderr, (text) => {
			stderrText += text;
			sink(text);
		}),
	]);
	const exitCode = await proc.wait();
	done();
	if (exitCode !== 0) {
		throw new Error(
			`modal: git clone failed (exit ${exitCode}): ${stderrText}`,
		);
	}
};

const fastForwardCheckout = async (
	sandbox: Sandbox,
	rev: string,
	label: string,
): Promise<void> => {
	const script = [
		`cd ${MODAL_REPO_ROOT}`,
		`(git fetch --quiet origin ${rev} && git checkout --quiet --force FETCH_HEAD) || ` +
			`(git remote prune origin; git fetch --quiet --all --prune && git checkout --quiet --force ${rev})`,
	].join(" && ");
	const proc = await withExecRetry(label, () =>
		sandbox.exec(["bash", "-lc", script], {
			stdout: "pipe",
			stderr: "pipe",
			workdir: "/",
		}),
	);
	let stderrText = "";
	await Promise.all([
		pumpStream(proc.stdout, (text) => sink(text)),
		pumpStream(proc.stderr, (text) => {
			stderrText += text;
			sink(text);
		}),
	]);
	const exitCode = await proc.wait();
	if (exitCode !== 0) {
		throw new Error(
			`modal: ${label} checkout of ${rev} failed (exit ${exitCode}): ${stderrText.slice(-500)}`,
		);
	}
};

const REQUIRED_WARM_BINARIES = [
	"/opt/kafka/kafka.Kafka",
	"/opt/autumn-tw/bin/fakecloud",
];

const assertWarmServicesBaked = async (sandbox: Sandbox): Promise<void> => {
	const proc = await withExecRetry("warm services check", () =>
		sandbox.exec(
			[
				"bash",
				"-c",
				REQUIRED_WARM_BINARIES.map((bin) => `test -x ${bin}`).join(" && "),
			],
			{ stdout: "pipe", stderr: "pipe", workdir: "/" },
		),
	);
	if ((await proc.wait()) !== 0) {
		throw new Error(
			`modal: warm image predates the base image (needs ${REQUIRED_WARM_BINARIES.join(", ")})`,
		);
	}
};

const isSandboxStreamClosed = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	return /terminated|already (completed|finished)|stream (closed|error)|connection (closed|reset)|ECONNRESET|UNAVAILABLE|task .* (exited|gone)/i.test(
		message,
	);
};

const createFromImage = async (
	image: Image,
	opts: {
		name: string;
		env: Record<string, string>;
		tags: Record<string, string>;
		cpu: number;
		memoryMiB: number;
		timeout?: number;
		encryptedPorts?: number[];
	},
	v2: boolean,
): Promise<Sandbox> => {
	const app = await getApp();
	if (!v2) {
		await pace();
	}
	const done = stage(`create sandbox ${opts.name}`);
	const base = {
		cpu: opts.cpu,
		memoryMiB: opts.memoryMiB,
		timeoutMs: opts.timeout ?? WORKER_TIMEOUT_MS,
		command: ["sleep", "infinity"],
		env: opts.env,
		workdir: MODAL_REPO_ROOT,
		encryptedPorts: opts.encryptedPorts,
	};
	const sandbox = v2
		? await modal.sandboxes.experimentalCreate(app, image, {
				...base,
				regions: MODAL_REGIONS,
			})
		: await modal.sandboxes.create(app, image, {
				...base,
				tags: tagsWithName(opts.name, opts.tags),
				name: opts.name,
			});
	liveSandboxes.set(opts.name, sandbox);
	liveSandboxes.set(sandbox.sandboxId, sandbox);
	done();
	return sandbox;
};

const makeModalProvider = (v2: boolean): ProviderImpl => {
	const warmupExecEnv = (): Record<string, string> => {
		const env: Record<string, string> = { NODE_ENV: "development" };
		for (const name of [
			"ENCRYPTION_IV",
			"ENCRYPTION_PASSWORD",
			"BETTER_AUTH_SECRET",
		]) {
			const value = process.env[name];
			if (!value) {
				throw new Error(`modal: missing secret ${name} in orchestrator env`);
			}
			env[name] = value;
		}
		env.AUTUMN_API_URL = `http://localhost:${SERVER_PORT}`;
		env.AUTUMN_PUBLIC_API_URL = `http://localhost:${SERVER_PORT}`;
		return env;
	};

	let refreshInFlight = false;
	const refreshWarmImageInBackground = (
		warmName: string,
		targetSha12: string,
		latestImage: Image,
	): void => {
		if (refreshInFlight) {
			return;
		}
		refreshInFlight = true;
		void (async () => {
			const done = stage(
				`background warm refresh → ${warmName} (nothing waits on this)`,
				60_000,
			);
			let sandbox: Sandbox | undefined;
			try {
				sandbox = await createFromImage(
					latestImage,
					{
						name: `${warmName}-refresh`,
						env: {},
						tags: { kind: "bun-tw-warm-refresh" },
						cpu: 4,
						memoryMiB: 8192,
						timeout: 30 * 60 * 1000,
					},
					v2,
				);
				await fastForwardCheckout(sandbox, targetSha12, "warm-refresh");
				const proc = await withExecRetry("warm-refresh warmup", () =>
					(sandbox as Sandbox).exec(
						["bash", "scripts/tw/image/warmup.sh", targetSha12],
						{
							stdout: "pipe",
							stderr: "pipe",
							workdir: MODAL_REPO_ROOT,
							env: warmupExecEnv(),
						},
					),
				);
				await Promise.all([
					pumpStream(proc.stdout, (text) => sink(text)),
					pumpStream(proc.stderr, (text) => sink(text)),
				]);
				const exitCode = await proc.wait();
				if (exitCode !== 0) {
					throw new Error(`warmup.sh exited ${exitCode}`);
				}
				const image = await (sandbox as Sandbox).snapshotFilesystem({
					timeoutMs: SNAPSHOT_TIMEOUT_MS,
					ttlMs: WARM_IMAGE_TTL_MS,
				});
				await publishWarmImage({ image, sha12: targetSha12 });
			} catch (error) {
				narrate(
					chalk.yellow(
						`[modal] background warm refresh failed (${(error as Error).message?.slice(0, 120)}) — workers keep fast-forwarding`,
					),
				);
			} finally {
				await sandbox?.terminate().catch(() => {});
				refreshInFlight = false;
				done();
			}
		})();
	};

	return {
		async createWarmSandbox(
			opts: CreateSandboxOptions,
		): Promise<ProviderSandbox> {
			if (!opts.source) {
				throw new Error("modal: createWarmSandbox requires a git source");
			}
			{
				const latest = await lookupPublishedWarmImage("latest");
				if (latest) {
					const ffDone = stage(
						`fast-forward warm ${opts.name} from ${WARM_IMAGE_REPO}:latest`,
					);
					let sandbox: Sandbox | undefined;
					try {
						sandbox = await createFromImage(
							latest,
							{
								name: opts.name,
								env: opts.env,
								tags: opts.tags,
								cpu: opts.vcpus ?? WORKER_CPU,
								memoryMiB: WORKER_MEMORY_MIB,
								timeout: opts.timeout,
								encryptedPorts: opts.ports ?? [SERVER_PORT],
							},
							v2,
						);
						await assertWarmServicesBaked(sandbox);
						await fastForwardCheckout(
							sandbox,
							opts.source.revision,
							"warm-fast-forward",
						);
						ffDone();
						return wrap(opts.name, sandbox);
					} catch (error) {
						ffDone();
						await sandbox?.terminate().catch(() => {});
						narrate(
							chalk.yellow(
								`[modal] warm fast-forward failed (${(error as Error).message?.slice(0, 120)}) — falling back to full build`,
							),
						);
					}
				}
			}
			const image = await getBaseImage({
				gitUrl: cloneUrl(opts.source),
				gitRef: opts.source.revision,
				lockHash: lockHash(),
			});
			const sandbox = await createFromImage(
				image,
				{
					name: opts.name,
					env: opts.env,
					tags: opts.tags,
					cpu: opts.vcpus ?? WORKER_CPU,
					memoryMiB: WORKER_MEMORY_MIB,
					timeout: opts.timeout,
					encryptedPorts: opts.ports ?? [SERVER_PORT],
				},
				v2,
			);
			await cloneRepo(sandbox, opts.source);
			return wrap(opts.name, sandbox);
		},

		async createIngressSandbox(
			opts: CreateSandboxOptions,
		): Promise<ProviderSandbox> {
			const image = await getIngressImage();
			const sandbox = await createFromImage(
				image,
				{
					name: opts.name,
					env: opts.env,
					tags: opts.tags,
					cpu: opts.vcpus ?? 1,
					memoryMiB: INGRESS_MEMORY_MIB,
					timeout: opts.timeout,
					encryptedPorts: opts.ports ?? [INGRESS_PORT],
				},
				v2,
			);
			return wrap(opts.name, sandbox);
		},

		async forkWorker(opts: ForkWorkerOptions): Promise<ProviderSandbox> {
			const image = warmImageByName.get(opts.sourceSandbox);
			if (!image) {
				throw new Error(
					`modal: no warm snapshot for "${opts.sourceSandbox}" — snapshotAndStop must run first`,
				);
			}
			const sandbox = await createFromImage(
				image,
				{
					name: opts.name,
					env: opts.env,
					tags: opts.tags,
					cpu: opts.vcpus ?? WORKER_CPU,
					memoryMiB: WORKER_MEMORY_MIB,
					timeout: opts.timeout,
					encryptedPorts: opts.ports ?? [SERVER_PORT],
				},
				v2,
			);
			if (staleWarmNames.has(opts.sourceSandbox)) {
				const targetSha = opts.env.TW_TARGET_SHA;
				if (!targetSha) {
					throw new Error("modal: stale worker needs TW_TARGET_SHA in env");
				}
				const checkoutStartedAt = Date.now();
				await fastForwardCheckout(sandbox, targetSha, `worker-ff ${opts.name}`);
				return {
					...wrap(opts.name, sandbox),
					checkoutMs: Date.now() - checkoutStartedAt,
				};
			}
			return wrap(opts.name, sandbox);
		},

		async snapshotAndStop(
			sandbox: ProviderSandbox,
			opts?: SnapshotAndStopOptions,
		): Promise<string> {
			const sb = unwrap(sandbox);
			const done = stage("snapshot warm filesystem (source + pgdata)", 15_000);
			try {
				const image = await sb.snapshotFilesystem({
					timeoutMs: SNAPSHOT_TIMEOUT_MS,
					ttlMs: WARM_IMAGE_TTL_MS,
				});
				warmImageByName.set(sandbox.name, image);
				const sha12 = warmShaFromName(sandbox.name);
				if (sha12) {
					await publishWarmImage({
						image,
						sha12,
						shouldPublishLatest: opts?.shouldPublishLatest,
					});
					staleWarmNames.delete(sandbox.name);
				}
				await sb.terminate().catch(() => {});
				liveSandboxes.delete(sandbox.name);
				liveSandboxes.delete(sb.sandboxId);
				return image.imageId;
			} finally {
				done();
			}
		},

		async getPublicUrl(
			sandbox: ProviderSandbox,
			port: number,
		): Promise<string> {
			const tunnels = await unwrap(sandbox).tunnels();
			const tunnel = tunnels[port];
			if (!tunnel) {
				throw new Error(
					`modal: no tunnel for port ${port} (encryptedPorts must include it at create)`,
				);
			}
			return tunnel.url;
		},

		async getSandboxByName(name: string): Promise<ProviderSandbox | undefined> {
			const local = liveSandboxes.get(name);
			if (local) {
				return wrap(name, local);
			}
			const sha12 = warmShaFromName(name);
			if (sha12) {
				const exact = await lookupPublishedWarmImage(sha12);
				if (exact) {
					warmImageByName.set(name, exact);
					staleWarmNames.delete(name);
					narrate(
						chalk.magenta(
							`[modal] warm cache HIT (${WARM_IMAGE_REPO}:${sha12}) — skipping the entire warm build`,
						),
					);
					return { name, handle: undefined, warmHit: "exact" };
				}
				if (!STALE_WARM_DISABLED) {
					const latest = await lookupPublishedWarmImage("latest");
					if (latest) {
						warmImageByName.set(name, latest);
						staleWarmNames.add(name);
						narrate(
							chalk.magenta(
								`[modal] stale warm hit (${WARM_IMAGE_REPO}:latest → ${name}) — workers fast-forward at boot; background refresh kicked`,
							),
						);
						refreshWarmImageInBackground(name, sha12, latest);
						return { name, handle: undefined, warmHit: "stale" };
					}
				}
			}
			if (v2) {
				return undefined;
			}
			try {
				const sb = await modal.sandboxes.fromName(APP_NAME, name);
				return wrap(name, sb);
			} catch {
				return undefined;
			}
		},

		async deleteSandbox(
			sandboxOrName: ProviderSandbox | string,
		): Promise<void> {
			const key =
				typeof sandboxOrName === "string"
					? sandboxOrName
					: (sandboxOrName.id ?? sandboxOrName.name);
			let target: Sandbox | undefined =
				typeof sandboxOrName === "string"
					? liveSandboxes.get(key)
					: unwrap(sandboxOrName);
			if (!target) {
				target = await modal.sandboxes.fromId(key).catch(() => undefined);
				if (!target && !v2) {
					target = await modal.sandboxes
						.fromName(APP_NAME, key)
						.catch(() => undefined);
				}
			}
			if (target) {
				await target.terminate().catch(() => {});
			}
			liveSandboxes.delete(key);
			warmImageByName.delete(key);
			if (typeof sandboxOrName !== "string") {
				liveSandboxes.delete(sandboxOrName.name);
			}
		},

		async runStreaming(
			sandbox: ProviderSandbox,
			argv: string[],
			onChunk: (text: string) => void,
			opts?: RunStreamingOptions,
		): Promise<RunStreamingResult> {
			const proc = await withExecRetry("exec", () =>
				unwrap(sandbox).exec(argv, {
					stdout: "pipe",
					stderr: "pipe",
					workdir: MODAL_REPO_ROOT,
					env: opts?.env,
				}),
			);
			let stderrText = "";
			const pumps = Promise.all([
				pumpStream(proc.stdout, onChunk),
				pumpStream(proc.stderr, (text) => {
					stderrText += text;
					onChunk(text);
				}),
			]);
			try {
				await pumps;
			} catch (error) {
				if (!(opts?.swallowStreamClose && isSandboxStreamClosed(error))) {
					throw error;
				}
			}
			const exitCode = await proc.wait();
			return { exitCode, stderr: stderrText };
		},

		async runDetached(
			sandbox: ProviderSandbox,
			argv: string[],
			opts: RunDetachedOptions,
		): Promise<DetachedCommand> {
			const proc = await withExecRetry("boot", () =>
				unwrap(sandbox).exec(argv, {
					stdout: "pipe",
					stderr: "pipe",
					workdir: opts.cwd ?? MODAL_REPO_ROOT,
					env: opts.env,
				}),
			);
			void pumpStream(proc.stdout, opts.onChunk).catch(() => {});
			void pumpStream(proc.stderr, opts.onChunk).catch(() => {});
			return {
				wait: async () => ({ exitCode: await proc.wait() }),
			};
		},

		async listSandboxesByOwner(owner: string): Promise<ListedSandbox[]> {
			if (v2) {
				return [];
			}
			const listed: ListedSandbox[] = [];
			for await (const sb of modal.sandboxes.list({ tags: { owner } })) {
				let tags: Record<string, string> = {};
				try {
					tags = await sb.getTags();
				} catch {}
				listed.push({
					name: tags.name ?? sb.sandboxId,
					status: "running",
					createdAt: 0,
					tags,
				});
			}
			return listed;
		},

		isSandboxStreamClosed,
	};
};

const NUKE_IMAGE = "oven/bun:1";
const NUKE_SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;
const NUKE_CPU = 1;
const NUKE_MEMORY_MIB = 512;

export const spawnDetachedNukeSandbox = async ({
	name,
	script,
	env,
}: {
	name: string;
	script: string;
	env: Record<string, string>;
}): Promise<string> => {
	const app = await getApp();
	const image = await modal.images.fromRegistry(NUKE_IMAGE);
	const sandbox = await modal.sandboxes.create(app, image, {
		cpu: NUKE_CPU,
		memoryMiB: NUKE_MEMORY_MIB,
		timeoutMs: NUKE_SANDBOX_TIMEOUT_MS,
		command: ["bun", "-e", script],
		env,
		name,
		tags: tagsWithName(name, { kind: "bun-tw-nuke" }),
	});
	return sandbox.sandboxId;
};

export const modalProvider = makeModalProvider(false);
export const modalV2Provider = makeModalProvider(true);
