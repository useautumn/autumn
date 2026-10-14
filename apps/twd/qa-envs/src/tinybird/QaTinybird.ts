import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

const API_PORT = 7181;
const CLICKHOUSE_PORT = 7182;
const INSTANCE = "standard-3";
const IDLE_MS = 5 * 60_000;
const IDLE_CHECK_MS = 60_000;
const READY_WAIT_MS = 150_000;
const BACKSTOP_IDLE_MS = 60 * 60_000;
const WORKSPACE = "dev";

export const TINYBIRD_ENV_TOKEN = "qa-env-tinybird";

type LocalTokens = { admin_token: string; user_token: string };
type LocalWorkspace = { name: string; token: string };

export class QaTinybird extends DurableObject<Env> {
	private ready = false;
	private lastActiveWrite = 0;
	private token: string | null = null;

	private get container() {
		const container = this.ctx.container;
		if (!container) throw new Error("no container binding");
		return container;
	}

	private api(path: string, init?: RequestInit) {
		return this.container
			.getTcpPort(API_PORT)
			.fetch(`http://container${path}`, init);
	}

	async keepAlive({
		envName,
		expiresAt,
	}: {
		envName: string;
		expiresAt: number;
	}) {
		await this.ctx.storage.put({ envName, expiresAt });
		if (!this.container.running) await this.start();
		await this.markActive();
	}

	private async start() {
		const snapshot = await this.ctx.storage.get<ContainerSnapshot>("snapshot");
		this.ready = false;
		this.token = null;
		this.container.start({
			...(snapshot
				? { containerSnapshot: { id: snapshot.id } }
				: { image: this.container.images.tinybird }),
			instance: INSTANCE,
			enableInternet: true,
		});
		this.ctx.waitUntil(this.container.monitor().catch(() => {}));
		this.ctx.waitUntil(
			this.container.setInactivityTimeout(BACKSTOP_IDLE_MS).catch(() => {}),
		);
		this.lastActiveWrite = 0;
		await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);
	}

	private async markActive() {
		const now = Date.now();
		if (now - this.lastActiveWrite < 15_000) return;
		this.lastActiveWrite = now;
		await this.ctx.storage.put("lastActiveAt", now);
	}

	private async waitReady() {
		const deadline = Date.now() + READY_WAIT_MS;
		while (!this.ready && Date.now() < deadline) {
			this.ready = await this.answersApi().catch(() => false);
			if (!this.ready) await new Promise((r) => setTimeout(r, 1_000));
		}
		return this.ready;
	}

	private async answersApi() {
		const res = await this.api("/v0/sql?q=SELECT+1", {
			signal: AbortSignal.timeout(3_000),
		});
		return res.status < 500;
	}

	private async workspaceToken(): Promise<string> {
		if (this.token) return this.token;
		const tokens = (await (await this.api("/tokens")).json()) as LocalTokens;
		const list = async () =>
			(await (
				await this.api("/v1/user/workspaces?with_organization=true", {
					headers: { authorization: `Bearer ${tokens.admin_token}` },
				})
			).json()) as { workspaces: LocalWorkspace[]; organization_id?: string };
		let listed = await list();
		if (!listed.workspaces.some((w) => w.name === WORKSPACE)) {
			const body = new URLSearchParams({ name: WORKSPACE });
			if (listed.organization_id)
				body.set("assign_to_organization_id", listed.organization_id);
			await this.api("/v1/workspaces", {
				method: "POST",
				headers: {
					authorization: `Bearer ${tokens.user_token}`,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			});
			listed = await list();
		}
		const workspace = listed.workspaces.find((w) => w.name === WORKSPACE);
		if (!workspace) throw new Error(`Tinybird workspace ${WORKSPACE} missing`);
		this.token = workspace.token;
		return workspace.token;
	}

	private async withRealToken(req: Request, url: URL) {
		const headers = new Headers(req.headers);
		const auth = headers.get("authorization") ?? "";
		let swapped = false;
		if (auth === `Bearer ${TINYBIRD_ENV_TOKEN}`) {
			headers.set("authorization", `Bearer ${await this.workspaceToken()}`);
			swapped = true;
		} else if (auth.startsWith("Basic ")) {
			const [user, password] = atob(auth.slice(6)).split(":");
			if (password === TINYBIRD_ENV_TOKEN) {
				headers.set(
					"authorization",
					`Basic ${btoa(`${user}:${await this.workspaceToken()}`)}`,
				);
				swapped = true;
			}
		}
		if (url.searchParams.get("token") === TINYBIRD_ENV_TOKEN) {
			url.searchParams.set("token", await this.workspaceToken());
			swapped = true;
		}
		return { headers, swapped };
	}

	override async fetch(req: Request): Promise<Response> {
		const expiresAt = await this.ctx.storage.get<number>("expiresAt");
		if (!expiresAt || Date.now() > expiresAt)
			return new Response("This QA env has no Tinybird", { status: 404 });
		if (!this.container.running) await this.start();
		await this.markActive();
		if (!(await this.waitReady()))
			return new Response("Tinybird Local is still starting", {
				status: 503,
				headers: { "retry-after": "10" },
			});

		const url = new URL(req.url);
		const port =
			url.pathname === "/" || url.pathname === "/ping"
				? CLICKHOUSE_PORT
				: API_PORT;
		const { headers, swapped } = await this.withRealToken(req, url);
		const res = await this.container.getTcpPort(port).fetch(
			new Request(`http://container${url.pathname}${url.search}`, {
				method: req.method,
				headers,
				body: req.body,
				redirect: "manual",
			}),
		);
		if (swapped && (res.status === 401 || res.status === 403))
			this.token = null;
		return res;
	}

	async run({ command }: { command: string }) {
		if (!this.container.running) return { exitCode: -1, output: "not running" };
		const proc = await this.container.exec(["bash", "-c", command], {
			stderr: "combined",
		});
		const out = await proc.output();
		return {
			exitCode: out.exitCode,
			output: new TextDecoder().decode(out.stdout).slice(-20_000),
		};
	}

	async status() {
		return {
			awake: this.container.running,
			lastActiveAt: await this.ctx.storage.get<number>("lastActiveAt"),
			snapshotBytes: (await this.ctx.storage.get<ContainerSnapshot>("snapshot"))
				?.size,
		};
	}

	async sleepNow() {
		if (!this.container.running) return;
		const envName = (await this.ctx.storage.get<string>("envName")) ?? "env";
		const stop = await this.container.exec(["supervisorctl", "stop", "all"], {
			stderr: "combined",
		});
		const { exitCode } = await stop.output();
		if (exitCode !== 0) return;
		const snapshot = await this.container.snapshotContainer({
			name: `qa-tb-${envName}`,
		});
		await this.ctx.storage.put("snapshot", snapshot);
		await this.container.destroy("idle");
		this.ready = false;
		this.token = null;
	}

	async destroyAll() {
		if (this.container.running) await this.container.destroy("deleted");
		this.ready = false;
		this.token = null;
		await this.ctx.storage.deleteAll();
	}

	override async alarm() {
		const expiresAt = await this.ctx.storage.get<number>("expiresAt");
		if (!expiresAt) return;
		if (Date.now() >= expiresAt) return this.destroyAll();
		if (!this.container.running) return this.ctx.storage.setAlarm(expiresAt);
		const lastActiveAt =
			(await this.ctx.storage.get<number>("lastActiveAt")) ?? 0;
		if (Date.now() - lastActiveAt >= IDLE_MS) await this.sleepNow();
		if (!this.container.running) return this.ctx.storage.setAlarm(expiresAt);
		await this.ctx.storage.setAlarm(
			Math.min(expiresAt, Date.now() + IDLE_CHECK_MS),
		);
	}
}
