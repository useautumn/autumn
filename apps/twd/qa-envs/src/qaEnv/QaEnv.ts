import { DurableObject } from "cloudflare:workers";
import {
	deleteEnvHostname,
	ensureEnvHostname,
} from "../cloudflare/envHostname";
import { deleteNeonBranch } from "../neon/deleteNeonBranch";
import { buildProgress } from "../pages/buildProgress";
import { progressPage } from "../pages/progressPage";
import { wakingPage } from "../pages/wakingPage";
import type {
	BuildResult,
	CreateEnvInput,
	Env,
	EnvConfig,
	EnvState,
	QueuedWebhook,
} from "../types";
import { sharedEnv } from "./sharedEnv";
import { qaEnvStub, routerStub } from "./stubs";
import { describeRequest, wakesEnv } from "./wakesEnv";

const WORKER_SCRIPT = "qa-envs";
const APP_PORT = 3000;
const DEFAULT_TTL_MS = 3 * 24 * 60 * 60_000;
const IDLE_MS = 5 * 60_000;
const IDLE_CHECK_MS = 60_000;
// 4 vCPU: the server and balance worker boot in parallel instead of contending for 2 (~$0.22/env vs ~$0.15).
const RUN_INSTANCE = "standard-4";
const TOMBSTONE_MS = 7 * 24 * 60 * 60_000;
/** Tabs report ms since the user last interacted; past this their polling stops counting as activity. */
const BACKGROUND_POLL_MS = 10 * 60_000;
const READY_WAIT_MS = 90_000;
const BUILD_IDLE_MS = 30 * 60_000;
const BUILD_POLL_MS = 5_000;
const BUILDER_RETENTION_MS = 60 * 60_000;
const PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
// OAuth-connected orgs keep their account in account_id, platform-created ones in default_account_id.
const ACCOUNTS_QUERY =
	"select distinct a from organizations, lateral (values (test_stripe_connect->>'account_id'), (test_stripe_connect->>'default_account_id')) v(a) where a is not null";

type BuilderConfig = {
	envName: string;
	buildId: string;
	config: EnvConfig;
	startedAt: number;
};
type BuilderState = "uploading" | "building" | "succeeded" | "failed";

/**
 * One instance per QA env (name = env name) or per build (name = `build:<env>:<buildId>`).
 * Builds run in their own instance so a re-ship keeps serving the old snapshot until the new one is ready.
 */
export class QaEnv extends DurableObject<Env> {
	private ready = false;
	private lastActiveWrite = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const container = ctx.container;
		if (container?.running)
			void ctx.blockConcurrencyWhile(() =>
				container.setInactivityTimeout(IDLE_MS),
			);
	}

	private get container() {
		const container = this.ctx.container;
		if (!container) throw new Error("no container binding");
		return container;
	}

	private async exec({
		cmd,
		env,
	}: {
		cmd: string[];
		env?: Record<string, string>;
	}) {
		const proc = await this.container.exec(cmd, {
			stderr: "combined",
			env: env && { PATH, ...env },
		});
		const out = await proc.output();
		return {
			exitCode: out.exitCode,
			output: new TextDecoder().decode(out.stdout),
		};
	}

	private async stripeAccounts({ databaseUrl }: { databaseUrl: string }) {
		const { exitCode, output } = await this.exec({
			cmd: ["psql", databaseUrl, "-tAc", ACCOUNTS_QUERY],
		});
		if (exitCode !== 0) return null;
		return output
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.startsWith("acct_"));
	}

	// ---------------------------------------------------------------- builder role

	async startBuilder(builder: Omit<BuilderConfig, "startedAt">) {
		await this.ctx.storage.put("builder", {
			...builder,
			startedAt: Date.now(),
		});
		await this.ctx.storage.put(
			"builderState",
			"uploading" satisfies BuilderState,
		);
		this.container.start({
			image: this.container.images.base,
			instance: "standard-4",
			enableInternet: true,
		});
		await this.container.setInactivityTimeout(BUILD_IDLE_MS);
	}

	private async receiveSource(body: ReadableStream<Uint8Array>) {
		const proc = await this.container.exec(
			["sh", "-c", "cat > /tmp/src.tar.gz && wc -c < /tmp/src.tar.gz"],
			{
				stdin: "pipe",
			},
		);
		if (!proc.stdin) throw new Error("exec returned no stdin");
		const writer = proc.stdin.getWriter();
		for await (const chunk of body) await writer.write(chunk);
		await writer.close();
		const out = await proc.output();
		return Response.json({
			exitCode: out.exitCode,
			bytes: Number(new TextDecoder().decode(out.stdout).trim()),
		});
	}

	/** prepare.sh runs detached and the alarm polls it: a waitUntil holding it would be cut off. */
	async runBuild() {
		const builder = await this.ctx.storage.get<BuilderConfig>("builder");
		if (!builder) throw new Error("not a builder");
		await this.exec({
			cmd: [
				"sh",
				"-c",
				"(setsid /qa/prepare.sh >/var/qa-prepare.log 2>&1; echo $? >/var/qa-prepare.exit) >/dev/null 2>&1 &",
			],
			env: {
				DATABASE_URL: builder.config.runtimeEnv.DATABASE_URL ?? "",
				PUBLIC_URL: builder.config.publicUrl,
				HOME: "/root",
			},
		});
		await this.ctx.storage.put(
			"builderState",
			"building" satisfies BuilderState,
		);
		await this.ctx.storage.put("buildStartedAt", Date.now());
		await this.ctx.storage.setAlarm(Date.now() + BUILD_POLL_MS);
	}

	async abandonBuild() {
		if (this.container.running) await this.container.destroy("build cancelled");
		await this.ctx.storage.put("builderState", "failed" satisfies BuilderState);
		await this.ctx.storage.setAlarm(Date.now() + BUILDER_RETENTION_MS);
	}

	async builderProgress() {
		const builder = await this.ctx.storage.get<BuilderConfig>("builder");
		const state = await this.ctx.storage.get<BuilderState>("builderState");
		if (!builder) return null;
		const log =
			state === "building" && this.container.running
				? await this.readBuildLog()
				: "";
		const buildStartedAt = await this.ctx.storage.get<number>("buildStartedAt");
		if (!buildStartedAt)
			return {
				state,
				log,
				phase: "starting build machine",
				elapsedMs: Date.now() - builder.startedAt,
				remainingMs: 135_000,
				percent: 1,
			};
		return {
			state,
			log,
			...buildProgress({ log, elapsedMs: Date.now() - buildStartedAt }),
		};
	}

	/** prepare.sh's step lines; never blocks a status read on a busy or still-starting container. */
	private async readBuildLog() {
		const read = this.exec({
			cmd: [
				"sh",
				"-c",
				"grep '^\\[qa-prepare\\]' /var/qa-prepare.log 2>/dev/null; tail -n 3 /var/qa-prepare.log 2>/dev/null | grep -v '^\\[qa-prepare\\]'",
			],
		}).then((r) => r.output);
		const timeout = new Promise<string>((r) => setTimeout(() => r(""), 3_000));
		return Promise.race([read, timeout]).catch(() => "");
	}

	private async pollBuild(builder: BuilderConfig) {
		if (!this.container.running)
			return this.finishBuild({
				builder,
				ok: false,
				log: "build container stopped",
			});
		const exit = (
			await this.exec({
				cmd: ["sh", "-c", "cat /var/qa-prepare.exit 2>/dev/null"],
			})
		).output.trim();
		if (exit === "")
			return this.ctx.storage.setAlarm(Date.now() + BUILD_POLL_MS);
		const log = (
			await this.exec({ cmd: ["tail", "-c", "8000", "/var/qa-prepare.log"] })
		).output;
		if (exit !== "0") return this.finishBuild({ builder, ok: false, log });
		const accounts = await this.stripeAccounts({
			databaseUrl: builder.config.runtimeEnv.DATABASE_URL ?? "",
		});
		const snapshot = await this.container.snapshotContainer({
			name: `qa-${builder.envName}-${builder.config.sha.slice(0, 12)}`,
		});
		return this.finishBuild({ builder, ok: true, log, snapshot, accounts });
	}

	private async finishBuild({
		builder,
		ok,
		log,
		snapshot,
		accounts,
	}: {
		builder: BuilderConfig;
		ok: boolean;
		log: string;
		snapshot?: ContainerSnapshot;
		accounts?: string[] | null;
	}) {
		if (this.container.running)
			await this.container.destroy(ok ? "built" : "build failed");
		const result: BuildResult = {
			buildId: builder.buildId,
			sha: builder.config.sha,
			ok,
			log,
			startedAt: builder.startedAt,
			finishedAt: Date.now(),
			snapshotBytes: snapshot?.size,
		};
		await this.ctx.storage.put(
			"builderState",
			(ok ? "succeeded" : "failed") satisfies BuilderState,
		);
		await qaEnvStub({ env: this.env, name: builder.envName }).adoptBuild({
			result,
			snapshot,
			accounts: accounts ?? undefined,
		});
		await this.ctx.storage.setAlarm(Date.now() + BUILDER_RETENTION_MS);
	}

	// ---------------------------------------------------------------- env role

	private config() {
		return this.ctx.storage.get<EnvConfig>("config");
	}

	private envState() {
		return this.ctx.storage.get<EnvState>("state");
	}

	private builderStub(buildId: string, name: string) {
		return qaEnvStub({ env: this.env, name: `build:${name}:${buildId}` });
	}

	/** Creates the env or re-ships it: the old snapshot, data and URL stay live until the new build is adopted. */
	async begin({
		name,
		publicUrl,
		input,
	}: {
		name: string;
		publicUrl: string;
		input: CreateEnvInput;
	}) {
		const previous = await this.config();
		const now = Date.now();
		const config: EnvConfig = {
			...input,
			neonBranchId: input.neonBranchId ?? previous?.neonBranchId,
			name,
			publicUrl,
			createdAt: previous?.createdAt ?? now,
			expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
		};
		const buildId = crypto.randomUUID().slice(0, 8);
		await ensureEnvHostname({ env: this.env, name, script: WORKER_SCRIPT });
		// A live build keeps its config (database, secrets, expiry) until the new one is adopted.
		const hasLiveBuild = Boolean(await this.ctx.storage.get("snapshot"));
		const live = await this.config();
		// The new lifetime applies now; database and secrets switch only with the build.
		await this.ctx.storage.put(
			"config",
			hasLiveBuild && live ? { ...live, expiresAt: config.expiresAt } : config,
		);
		await this.ctx.storage.put("pendingConfig", config);
		await this.ctx.storage.put("pendingBuild", {
			buildId,
			sha: input.sha,
			startedAt: now,
		});
		if (!hasLiveBuild)
			await this.ctx.storage.put("state", "building" satisfies EnvState);
		// Only now has the env left the expired state, so the tombstone deadline can go.
		await this.ctx.storage.delete("tombstoneUntil");
		// The alarm reschedules itself: idle checks while awake, else the live expiry.
		await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);
		await this.builderStub(buildId, name).startBuilder({
			envName: name,
			buildId,
			config,
		});
		return { buildId, publicUrl, expiresAt: config.expiresAt };
	}

	/** Stops a pending build so it can never be adopted, e.g. after its database was dropped. */
	async cancelBuild({ buildId }: { buildId: string }) {
		const config = await this.config();
		const pending = await this.ctx.storage.get<{ buildId: string }>(
			"pendingBuild",
		);
		if (pending?.buildId === buildId)
			await this.ctx.storage.delete(["pendingBuild", "pendingConfig"]);
		if (config) await this.builderStub(buildId, config.name).abandonBuild();
		if (!(await this.ctx.storage.get("snapshot")))
			await this.ctx.storage.put("state", "failed" satisfies EnvState);
	}

	async adoptBuild({
		result,
		snapshot,
		accounts,
	}: {
		result: BuildResult;
		snapshot?: ContainerSnapshot;
		accounts?: string[];
	}) {
		const pending = await this.ctx.storage.get<{ buildId: string }>(
			"pendingBuild",
		);
		await this.ctx.storage.put("lastBuild", result);
		if (pending?.buildId !== result.buildId) return;
		if ((await this.envState()) === "expired") return;
		const pendingConfig =
			await this.ctx.storage.get<EnvConfig>("pendingConfig");
		await this.ctx.storage.delete(["pendingBuild", "pendingConfig"]);
		if (!result.ok || !snapshot) {
			if (!(await this.ctx.storage.get("snapshot")))
				await this.ctx.storage.put("state", "failed" satisfies EnvState);
			return;
		}
		await this.ctx.storage.put("snapshot", snapshot);
		if (pendingConfig) await this.ctx.storage.put("config", pendingConfig);
		await this.ctx.storage.put("sha", result.sha);
		await this.ctx.storage.put("state", "ready" satisfies EnvState);
		if (accounts) await this.registerAccounts(accounts);
		// The next request wakes on the new build.
		if (this.container.running) await this.container.destroy("re-shipped");
		this.ready = false;
	}

	private async registerAccounts(accounts: string[]) {
		const config = await this.config();
		if (!config) return;
		await routerStub({ env: this.env }).setAccounts(config.name, accounts);
		await this.ctx.storage.put("stripeAccounts", accounts);
	}

	async status() {
		const config = await this.config();
		const pending = await this.ctx.storage.get<{
			buildId: string;
			sha: string;
			startedAt: number;
		}>("pendingBuild");
		const lastBuild = await this.ctx.storage.get<BuildResult>("lastBuild");
		return {
			name: config?.name,
			url: config?.publicUrl,
			sha: await this.ctx.storage.get<string>("sha"),
			state: (await this.envState()) ?? "absent",
			awake: this.container.running,
			createdAt: config?.createdAt,
			expiresAt: config?.expiresAt,
			neonBranchId: config?.neonBranchId,
			pendingBuild: pending && {
				...pending,
				progress: await this.builderStub(pending.buildId, config?.name ?? "")
					.builderProgress()
					.catch(() => null),
			},
			lastBuild: lastBuild && {
				...lastBuild,
				log: lastBuild.ok ? undefined : lastBuild.log,
			},
			lastActiveAt: await this.ctx.storage.get<number>("lastActiveAt"),
			lastWakeBy: await this.ctx.storage.get("lastWakeBy"),
			lastRefusedWake: await this.ctx.storage.get("lastRefusedWake"),
			stripeAccounts: await this.ctx.storage.get<string[]>("stripeAccounts"),
			queuedWebhooks: (await this.ctx.storage.list({ prefix: "webhook:" }))
				.size,
		};
	}

	/** Idle sleep is ours: a pending monitor() keeps the DO active, so the inactivity timeout alone never fires. */
	private async markActive() {
		const now = Date.now();
		if (now - this.lastActiveWrite < 15_000) return;
		this.lastActiveWrite = now;
		await this.ctx.storage.put("lastActiveAt", now);
	}

	private async wake(config: EnvConfig) {
		const snapshot = await this.ctx.storage.get<ContainerSnapshot>("snapshot");
		if (!snapshot) throw new Error("no snapshot");
		this.ready = false;
		this.container.start({
			containerSnapshot: { id: snapshot.id },
			instance: RUN_INSTANCE,
			enableInternet: true,
			env: {
				...sharedEnv({ env: this.env }),
				...config.runtimeEnv,
				PUBLIC_URL: config.publicUrl,
			},
		});
		this.ctx.waitUntil(
			this.container.setInactivityTimeout(IDLE_MS).catch(() => {}),
		);
		this.lastActiveWrite = 0;
		await this.markActive();
		await this.ctx.storage.setAlarm(
			Math.min(config.expiresAt, Date.now() + IDLE_CHECK_MS),
		);
		this.ctx.waitUntil(
			this.container.monitor().then(
				() => this.ctx.storage.put("lastExit", { at: Date.now() }),
				(e) =>
					this.ctx.storage.put("lastExit", {
						at: Date.now(),
						error: String(e),
					}),
			),
		);
	}

	private async probeReady(): Promise<boolean> {
		if (!this.container.running) return false;
		if (this.ready) return true;
		// A container still restoring holds connections open; never let that delay the waking page.
		this.ready = await Promise.race([
			this.container
				.getTcpPort(APP_PORT)
				.fetch("http://container/__qa/ready", {
					signal: AbortSignal.timeout(2_000),
				})
				.then((r) => r.status === 200)
				.catch(() => false),
			new Promise<false>((r) => setTimeout(() => r(false), 2_000)),
		]);
		return this.ready;
	}

	private async waitReady(deadline: number) {
		while (Date.now() < deadline) {
			if (await this.probeReady()) return true;
			await new Promise((r) => setTimeout(r, 250));
		}
		return false;
	}

	override async fetch(req: Request): Promise<Response> {
		if (req.headers.get("x-qa-internal") === "source" && req.body)
			return this.receiveSource(req.body);
		const config = await this.config();
		const state = await this.envState();
		if (!config) return new Response("No such QA env", { status: 404 });
		if (state === "expired" || Date.now() > config.expiresAt)
			return new Response("This QA env has expired", { status: 410 });

		const url = new URL(req.url);
		// Webhooks arrive only through the signed hooks.<domain> router; the server here skips verification.
		if (url.pathname.startsWith("/webhooks/"))
			return new Response("Not found", { status: 404 });
		if (url.pathname === "/__qa_progress")
			return Response.json(await this.progress(state));
		if (state !== "ready")
			return progressPage({ name: config.name, sha: config.sha });
		if (!this.container.running) {
			if (!wakesEnv({ req, url })) {
				await this.ctx.storage.put(
					"lastRefusedWake",
					describeRequest({ req, url }),
				);
				return new Response(
					"This QA env is asleep. Open it in a browser to wake it.",
					{
						status: 503,
						headers: { "retry-after": "30" },
					},
				);
			}
			await this.ctx.storage.put("lastWakeBy", describeRequest({ req, url }));
			await this.wake(config);
		}
		if (url.pathname === "/__qa_wake_status")
			return Response.json({ ready: await this.probeReady() });
		if (url.pathname.startsWith("/__qa/"))
			return new Response("Not found", { status: 404 });

		if (!(Number(req.headers.get("x-qa-idle-ms") ?? 0) > BACKGROUND_POLL_MS))
			await this.markActive();
		if (!(await this.probeReady())) {
			const isPageLoad =
				req.method === "GET" &&
				(req.headers.get("accept") ?? "").includes("text/html");
			if (isPageLoad)
				return wakingPage({
					name: config.name,
					sha: (await this.ctx.storage.get<string>("sha")) ?? config.sha,
				});
			if (!(await this.waitReady(Date.now() + READY_WAIT_MS)))
				return new Response("QA env is still waking", {
					status: 503,
					headers: { "retry-after": "5" },
				});
		}

		const headers = new Headers(req.headers);
		headers.set("x-forwarded-proto", "https");
		headers.set("x-forwarded-host", url.host);
		return this.container.getTcpPort(APP_PORT).fetch(
			new Request(`http://container${url.pathname}${url.search}`, {
				method: req.method,
				headers,
				body: req.body,
				redirect: "manual",
			}),
		);
	}

	private async progress(state: EnvState | undefined) {
		const pending = await this.ctx.storage.get<{ buildId: string }>(
			"pendingBuild",
		);
		const config = await this.config();
		const progress =
			pending && config
				? await this.builderStub(pending.buildId, config.name).builderProgress()
				: null;
		const lastBuild = await this.ctx.storage.get<BuildResult>("lastBuild");
		return {
			...(progress ?? {
				phase: state,
				elapsedMs: 0,
				remainingMs: 0,
				percent: 100,
				log: "",
			}),
			state,
			...(state === "failed" && lastBuild
				? { log: lastBuild.log.slice(-4000) }
				: {}),
		};
	}

	async enqueueWebhook(event: QueuedWebhook) {
		if ((await this.envState()) !== "ready") return;
		await this.ctx.storage.put(
			`webhook:${Date.now()}:${crypto.randomUUID()}`,
			event,
		);
		const alarm = await this.ctx.storage.getAlarm();
		if (!alarm || alarm > Date.now() + 1_000)
			await this.ctx.storage.setAlarm(Date.now());
	}

	/** Wakes the env if needed and posts queued webhooks in order; failures stay queued for the next alarm. */
	private async deliverWebhooks(config: EnvConfig) {
		const queued = await this.ctx.storage.list<QueuedWebhook>({
			prefix: "webhook:",
		});
		if (queued.size === 0) return true;
		if (!this.container.running) await this.wake(config);
		if (!(await this.waitReady(Date.now() + READY_WAIT_MS))) return false;
		await this.markActive();
		for (const [key, event] of queued) {
			const res = await this.container
				.getTcpPort(APP_PORT)
				.fetch("http://container/webhooks/connect/sandbox", {
					method: "POST",
					headers: event.headers,
					body: event.body,
				})
				.catch(() => null);
			if (!res || res.status >= 500) return false;
			await this.ctx.storage.delete(key);
		}
		return true;
	}

	/** Agent debugging: last lines of one service's log, from a woken env. */
	async logs({ service, lines }: { service: string; lines: number }) {
		const config = await this.config();
		if (!config) throw new Error("no such env");
		if (!/^[a-z-]+$/.test(service)) throw new Error("invalid service");
		await this.ensureAwake(config);
		const file = `/var/qa/logs/${service}.log`;
		return this.exec({
			cmd: [
				"sh",
				"-c",
				`ls /var/qa/logs; echo ---; tail -n ${Math.min(lines, 2000)} ${file} 2>&1`,
			],
		});
	}

	/** Agent debugging: one shell command in the env, with the env's runtime variables (DATABASE_URL for psql). */
	async run({ command }: { command: string }) {
		const config = await this.config();
		if (!config) throw new Error("no such env");
		await this.ensureAwake(config);
		await this.markActive();
		const { exitCode, output } = await this.exec({
			cmd: ["bash", "-c", command],
			env: {
				...config.runtimeEnv,
				PUBLIC_URL: config.publicUrl,
				HOME: "/root",
			},
		});
		return { exitCode, output: output.slice(-20_000) };
	}

	/** Restarts the stack from the snapshot (fresh Dragonfly/Kafka/fakecloud); data in Neon is kept. */
	async restart() {
		const config = await this.config();
		if (!config) throw new Error("no such env");
		if (this.container.running) await this.container.destroy("restart");
		this.ready = false;
		await this.wake(config);
		return { ready: await this.waitReady(Date.now() + READY_WAIT_MS) };
	}

	/** Runs a command on the env's stopped filesystem and keeps the result as the env's snapshot. */
	async patch({ command }: { command: string }) {
		const config = await this.config();
		const snapshot = await this.ctx.storage.get<ContainerSnapshot>("snapshot");
		if (!config || !snapshot) throw new Error("env has no snapshot");
		if (this.container.running) await this.container.destroy("patch");
		this.ready = false;
		this.container.start({
			containerSnapshot: { id: snapshot.id },
			entrypoint: ["sleep", "infinity"],
			instance: RUN_INSTANCE,
			enableInternet: true,
		});
		const result = await this.exec({
			cmd: ["bash", "-c", command],
			env: { HOME: "/root" },
		});
		if (result.exitCode === 0) {
			const next = await this.container.snapshotContainer({
				name: `${snapshot.name ?? "qa"}-patch`,
			});
			await this.ctx.storage.put("snapshot", next);
		}
		await this.container.destroy("patched");
		return {
			exitCode: result.exitCode,
			output: result.output.slice(-20_000),
			kept: result.exitCode === 0,
		};
	}

	private async ensureAwake(config: EnvConfig) {
		if ((await this.envState()) !== "ready")
			throw new Error("env is not ready");
		if (!this.container.running) await this.wake(config);
		if (!(await this.waitReady(Date.now() + READY_WAIT_MS)))
			throw new Error("env did not become ready");
	}

	/** Keeps webhook routing current while QA connects or swaps Stripe accounts. */
	private async refreshStripeAccounts(config: EnvConfig) {
		const accounts = await this.stripeAccounts({
			databaseUrl: config.runtimeEnv.DATABASE_URL ?? "",
		}).catch(() => null);
		if (accounts) await this.registerAccounts(accounts);
	}

	async sleepNow() {
		const config = await this.config();
		if (config && this.container.running)
			await this.refreshStripeAccounts(config);
		if (this.container.running) await this.container.destroy("idle");
		this.ready = false;
	}

	async destroyEnv() {
		const config = await this.config();
		if (this.container.running) await this.container.destroy("expired");
		this.ready = false;
		if (config) {
			await routerStub({ env: this.env }).setAccounts(config.name, []);
			if (config.neonBranchId)
				await deleteNeonBranch({
					env: this.env,
					branchId: config.neonBranchId,
				});
		}
		await this.ctx.storage.delete([
			"snapshot",
			"pendingBuild",
			"pendingConfig",
		]);
		await this.ctx.storage.put("state", "expired" satisfies EnvState);
		// The hostname stays for a week so old links answer 410 instead of a Cloudflare DNS error.
		const tombstoneUntil = Date.now() + TOMBSTONE_MS;
		await this.ctx.storage.put("tombstoneUntil", tombstoneUntil);
		await this.ctx.storage.setAlarm(tombstoneUntil);
	}

	/** Blocks other calls so a re-create can't land between the hostname delete and the wipe. */
	private removeTombstone(config: EnvConfig) {
		return this.ctx.blockConcurrencyWhile(async () => {
			if ((await this.envState()) !== "expired") return;
			// Another alarm may fire early (e.g. an idle check rescheduled during destroy).
			const tombstoneUntil =
				(await this.ctx.storage.get<number>("tombstoneUntil")) ?? 0;
			if (Date.now() < tombstoneUntil)
				return this.ctx.storage.setAlarm(tombstoneUntil);
			await deleteEnvHostname({ env: this.env, name: config.name });
			await this.ctx.storage.deleteAll();
		});
	}

	override async alarm() {
		const builder = await this.ctx.storage.get<BuilderConfig>("builder");
		if (builder) {
			const builderState =
				await this.ctx.storage.get<BuilderState>("builderState");
			if (builderState === "building") return this.pollBuild(builder);
			if (builderState !== "uploading") return this.ctx.storage.deleteAll();
			return;
		}

		const config = await this.config();
		if (!config) return;
		if ((await this.envState()) === "expired")
			return this.removeTombstone(config);
		if (Date.now() >= config.expiresAt) return this.destroyEnv();
		if (!(await this.deliverWebhooks(config)))
			return this.ctx.storage.setAlarm(Date.now() + 15_000);
		if (!this.container.running)
			return this.ctx.storage.setAlarm(config.expiresAt);
		const lastActiveAt =
			(await this.ctx.storage.get<number>("lastActiveAt")) ?? 0;
		if (Date.now() - lastActiveAt >= IDLE_MS) {
			await this.sleepNow();
			return this.ctx.storage.setAlarm(config.expiresAt);
		}
		await this.refreshStripeAccounts(config);
		await this.ctx.storage.setAlarm(
			Math.min(config.expiresAt, Date.now() + IDLE_CHECK_MS),
		);
	}
}
