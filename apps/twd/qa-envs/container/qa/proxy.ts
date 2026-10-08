// One public port: the built dashboard plus the API paths the Capy Vite proxy forwards.
import { readFileSync } from "node:fs";

const DIST = "/app/vite/dist";
const API = "http://127.0.0.1:8080";
// Every fetch reports how long the user has been idle, so a forgotten tab's polling can't keep the env awake.
const IDLE_SCRIPT = `<script>(()=>{let t=Date.now();const a=()=>{t=Date.now()};
for(const e of["pointerdown","keydown","wheel","touchstart"])addEventListener(e,a,{passive:true,capture:true});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)a()});
const f=window.fetch;window.fetch=(i,o={})=>{const h=new Headers(o.headers||(i instanceof Request?i.headers:undefined));
h.set("x-qa-idle-ms",String(Date.now()-t));return f(i,{...o,headers:h})};
const s=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(b){try{this.setRequestHeader("x-qa-idle-ms",String(Date.now()-t))}catch{}return s.call(this,b)};})();</script>`;
const INDEX_HTML = (await Bun.file(`${DIST}/index.html`).text()).replace(
	"<head>",
	`<head>${IDLE_SCRIPT}`,
);

const toApi = ({ req, path }: { req: Request; path: string }) => {
	const url = new URL(req.url);
	const headers = new Headers(req.headers);
	headers.delete("host");
	return fetch(`${API}${path}${url.search}`, {
		method: req.method,
		headers,
		body: req.body,
		redirect: "manual",
		// @ts-expect-error Bun streams request bodies
		duplex: "half",
	});
};

const isServerUp = () =>
	fetch(`${API}/api/auth/get-session`)
		.then((r) => r.status === 200)
		.catch(() => false);

const ROUTING_WAIT_MS = 90_000;
const bootedAt = Date.now();

/** boot.sh marks when the balance worker has claimed every partition; before that commands fail with NO_OWNER. */
const isBalanceWorkerRouting = async () =>
	// Never strand the env behind the waking page if the marker never lands.
	Date.now() - bootedAt > ROUTING_WAIT_MS ||
	(await Bun.file("/var/qa/balance-owned").exists());

const cgroupStat = (file: string) => {
	try {
		return readFileSync(`/sys/fs/cgroup/${file}`, "utf8").trim();
	} catch {
		return null;
	}
};

const stats = () => {
	const meminfo = readFileSync("/proc/meminfo", "utf8");
	const kb = (key: string) =>
		Number(new RegExp(`${key}:\\s+(\\d+)`).exec(meminfo)?.[1] ?? 0);
	const cpu = readFileSync("/proc/stat", "utf8").split("\n")[0];
	return {
		bootStartNs: readFileSync("/var/qa/boot-start", "utf8").trim(),
		nowNs: String(Bun.nanoseconds()),
		nowMs: Date.now(),
		uptimeS: Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]),
		memTotalMb: Math.round(kb("MemTotal") / 1024),
		memUsedMb: Math.round((kb("MemTotal") - kb("MemAvailable")) / 1024),
		cpuStat: cpu,
		cgroupMemCurrent: cgroupStat("memory.current"),
		cgroupMemPeak: cgroupStat("memory.peak"),
		cgroupCpu: cgroupStat("cpu.stat"),
		loadavg: readFileSync("/proc/loadavg", "utf8").trim(),
	};
};

Bun.serve({
	port: 3000,
	idleTimeout: 120,
	async fetch(req) {
		const { pathname } = new URL(req.url);
		if (pathname === "/__qa/ready") {
			const ok = (await isServerUp()) && (await isBalanceWorkerRouting());
			return new Response(ok ? "ready" : "starting", {
				status: ok ? 200 : 503,
			});
		}
		if (pathname === "/__qa/stats") return Response.json(stats());
		if (pathname.startsWith("/__autumn_api/") || pathname === "/__autumn_api")
			return toApi({
				req,
				path: pathname.slice("/__autumn_api".length) || "/",
			});
		if (pathname.startsWith("/api/auth/") || pathname.startsWith("/webhooks/"))
			return toApi({ req, path: pathname });
		if (pathname !== "/" && !pathname.includes("..")) {
			const file = Bun.file(`${DIST}${pathname}`);
			if (await file.exists())
				return new Response(file, {
					headers: pathname.startsWith("/assets/")
						? { "cache-control": "public, max-age=31536000, immutable" }
						: {},
				});
		}
		return new Response(INDEX_HTML, {
			headers: { "content-type": "text/html" },
		});
	},
});
