import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	checkoutPortFor,
	devProxyPortFor,
	EMULATE_PORT,
	leafPortFor,
	serverPortFor,
	vitePortFor,
} from "../helpers/ports.ts";
import { DEV_PROXY_PREFIXES, matchDevProxyRoute } from "./routes.ts";

const AGENT_DIR = join(homedir(), ".autumn-agent");
const PIDFILE = join(AGENT_DIR, "dev-proxy.pid");
const PORTFILE = join(AGENT_DIR, "dev-proxy.port");

type UpstreamPorts = {
	api: number;
	vite: number;
	leaf: number;
	checkout: number;
	emulate: number;
};

type WsData = {
	upstream: WebSocket;
	pending: (string | Buffer)[];
};

function worktreeNumFromEnv(): number {
	const raw = Number(process.env.DW_WORKTREE_NUM ?? "1");
	return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

function upstreamPorts({
	worktreeNum,
}: {
	worktreeNum: number;
}): UpstreamPorts {
	return {
		api: serverPortFor(worktreeNum),
		checkout: checkoutPortFor(worktreeNum),
		emulate: EMULATE_PORT,
		leaf: leafPortFor(worktreeNum),
		vite: vitePortFor(worktreeNum),
	};
}

const TRAILING_SLASH_PREFIXES = new Set<string>([
	DEV_PROXY_PREFIXES.dashboard,
	DEV_PROXY_PREFIXES.checkout,
]);

function hopByHopHeaders(): Set<string> {
	return new Set([
		"connection",
		"keep-alive",
		"proxy-authenticate",
		"proxy-authorization",
		"te",
		"trailers",
		"transfer-encoding",
		"upgrade",
		"host",
	]);
}

function websocketProtocols(req: Request): string[] {
	return (
		req.headers
			.get("sec-websocket-protocol")
			?.split(",")
			.map((p) => p.trim())
			.filter(Boolean) ?? []
	);
}

function upstreamWsPath(path: string): string {
	if (TRAILING_SLASH_PREFIXES.has(path)) return `${path}/`;
	return path;
}

async function proxyHttp({
	req,
	port,
	path,
}: {
	req: Request;
	port: number;
	path: string;
}): Promise<Response> {
	const incoming = new URL(req.url);
	const dest = `http://127.0.0.1:${port}${path}${incoming.search}`;
	const headers = new Headers();
	const skip = hopByHopHeaders();
	req.headers.forEach((value, key) => {
		if (!skip.has(key.toLowerCase())) headers.set(key, value);
	});
	const incomingHost = req.headers.get("host");
	if (incomingHost) {
		headers.set("host", incomingHost);
		headers.set("x-forwarded-host", incomingHost);
	}
	headers.set(
		"x-forwarded-proto",
		incoming.protocol === "https:" ? "https" : "http",
	);

	try {
		return await fetch(dest, {
			body:
				req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
			duplex: "half",
			headers,
			method: req.method,
			redirect: "manual",
		} as RequestInit);
	} catch {
		return new Response(`dev-proxy: ${dest} is down`, { status: 502 });
	}
}

export function startDevProxy({
	port,
	ports,
}: {
	port: number;
	ports: UpstreamPorts;
}): ReturnType<typeof Bun.serve> {
	return Bun.serve({
		port,
		async fetch(req, server) {
			const url = new URL(req.url);
			if (url.pathname === "/__dev-proxy") {
				return new Response("ok");
			}
			const isWebsocket =
				req.headers.get("upgrade")?.toLowerCase() === "websocket";
			if (url.pathname === "/" && !isWebsocket) {
				return Response.redirect(
					new URL(`${DEV_PROXY_PREFIXES.dashboard}/`, url),
					302,
				);
			}
			if (TRAILING_SLASH_PREFIXES.has(url.pathname)) {
				return Response.redirect(new URL(`${url.pathname}/`, url), 302);
			}
			const matched = matchDevProxyRoute({
				pathname: url.pathname,
				ports,
				referer: req.headers.get("referer") ?? undefined,
				websocket: isWebsocket,
			});
			if (!matched) {
				return new Response("dev-proxy: no route", { status: 404 });
			}
			if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
				const path = upstreamWsPath(matched.path);
				const dest = `ws://127.0.0.1:${matched.port}${path}${url.search}`;
				const protocols = websocketProtocols(req);
				const upstream = protocols.length
					? new WebSocket(dest, protocols)
					: new WebSocket(dest);
				upstream.addEventListener("error", () => {});
				const upgraded = server.upgrade(req, {
					data: { pending: [], upstream } satisfies WsData,
					headers: protocols.length
						? { "Sec-WebSocket-Protocol": protocols[0] }
						: undefined,
				});
				if (!upgraded) {
					upstream.close();
					return new Response("dev-proxy: websocket upgrade failed", {
						status: 400,
					});
				}
				return undefined;
			}
			return proxyHttp({ path: matched.path, port: matched.port, req });
		},
		websocket: {
			open(ws) {
				const { upstream, pending } = ws.data as WsData;
				upstream.addEventListener("open", () => {
					for (const message of pending) upstream.send(message);
					pending.length = 0;
				});
				upstream.addEventListener("message", (event) => {
					if (typeof event.data === "string" || event.data instanceof Buffer) {
						ws.send(event.data);
					}
				});
				upstream.addEventListener("close", () => ws.close());
				upstream.addEventListener("error", () => ws.close());
			},
			message(ws, message) {
				const { upstream, pending } = ws.data as WsData;
				if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
				else pending.push(message);
			},
			close(ws) {
				(ws.data as WsData).upstream.close();
			},
		},
	});
}

function proxyAlreadyUp({ port }: { port: number }): boolean {
	return (
		Bun.spawnSync([
			"curl",
			"-sf",
			"--max-time",
			"1",
			`http://127.0.0.1:${port}/__dev-proxy`,
		]).exitCode === 0
	);
}

export function ensureDevProxy({
	worktreeNum,
}: {
	worktreeNum: number;
}): number {
	const port = devProxyPortFor(worktreeNum);
	mkdirSync(AGENT_DIR, { recursive: true });
	writeFileSync(PORTFILE, `${port}\n`);
	if (proxyAlreadyUp({ port })) {
		console.log(`[dev-proxy] already running on :${port}`);
		return port;
	}

	const log = join(AGENT_DIR, "dev-proxy.log");
	const started = Bun.spawnSync(
		[
			"bash",
			"-c",
			`nohup "${process.execPath}" "${import.meta.path}" --serve >"${log}" 2>&1 & echo $!`,
		],
		{
			cwd: process.cwd(),
			env: {
				...(process.env as Record<string, string>),
				DW_WORKTREE_NUM: String(worktreeNum),
			},
		},
	);
	const pid = new TextDecoder().decode(started.stdout).trim();
	if (pid) writeFileSync(PIDFILE, `${pid}\n`);

	const deadline = Date.now() + 4000;
	while (Date.now() < deadline) {
		if (proxyAlreadyUp({ port })) {
			console.log(`[dev-proxy] listening on :${port}`);
			return port;
		}
		Bun.sleepSync(50);
	}
	console.error(`[dev-proxy] :${port} did not come up`);
	return port;
}

if (import.meta.main) {
	const worktreeNum = worktreeNumFromEnv();
	const port = devProxyPortFor(worktreeNum);
	const ports = upstreamPorts({ worktreeNum });
	if (process.argv.includes("--ensure")) {
		ensureDevProxy({ worktreeNum });
	} else {
		mkdirSync(AGENT_DIR, { recursive: true });
		writeFileSync(PIDFILE, `${process.pid}\n`);
		writeFileSync(PORTFILE, `${port}\n`);
		startDevProxy({ port, ports });
		console.log(
			`[dev-proxy] :${port} → /dashboard :${ports.vite} /backend :${ports.api} /leaf :${ports.leaf} /checkout :${ports.checkout}`,
		);
	}
}
