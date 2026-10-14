/**
 * Bench only: what the HTTP plumbing costs the thread that serves a check, with the engine stubbed out. One server
 * thread answers a fixed check response; a driver process sends checks at a fixed rate over keep-alive. Reports the
 * server thread's CPU per request (schedstat ns) for one variant.
 * `bun run bench:plumbing <variant> <rate> <seconds>`; variants are listed in VARIANTS.
 */

import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { createAtomApp } from "../../src/http/createAtomApp.js";
import { receiveCheck } from "../../src/http/handlers/receiveCheck.js";
import { admissionMiddleware } from "../../src/http/middlewares/admissionMiddleware.js";
import { checkHopMiddleware } from "../../src/http/middlewares/checkHopMiddleware.js";
import { clientAuthMiddleware } from "../../src/http/middlewares/clientAuthMiddleware.js";
import { requestBodyMiddleware } from "../../src/http/middlewares/requestBodyMiddleware.js";
import { requestLogMiddleware } from "../../src/http/middlewares/requestLog/requestLogMiddleware.js";
import { createReplicaRing } from "../../src/replicas/createReplicaRing.js";
import {
	readStageClock,
	timeStage,
} from "../../src/threads/stats/stageClock.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../src/threads/stats/threadStats.js";

const PORT = 18_290;
const HOST = "127.0.0.31";
const ATOM_TOKEN = "atom_token_bench";
const SECRET_KEY = "am_sk_test_bench_key";
const RESPONSE_JSON = readFileSync(
	`${import.meta.dir}/fixtures/checkResponse.json`,
	"utf8",
).trim();
const REQUEST_BODY = JSON.stringify({
	customer_id: "cus_hot_3",
	feature_id: "messages",
	send_event: true,
});

const threadCpuNs = (): number =>
	Number(readFileSync("/proc/thread-self/schedstat", "utf8").split(" ")[0]);

/** The check processor's answer, as the owner thread hands it back, with no engine behind it. */
const stubSlots = {
	processorFor: () => ({
		check: async () => ({ json: RESPONSE_JSON, allowed: true, denial: null }),
	}),
} as never;

const httpContextOf = ({ secretKeys }: { secretKeys: boolean }) => {
	const statsBuffer = createThreadStatsBuffer({ threads: 1 });
	return {
		auth: {
			authorize: () => stubSlots,
			slotsFor: () => stubSlots,
		},
		logger: { info() {}, warn() {}, error() {} },
		autumnApiUrl: "http://127.0.0.1:1",
		health: {
			bootedAt: new Date().toISOString(),
			restarts: new Int32Array(1),
			ready: new Int32Array([1]),
			threadsReady: new Int32Array([1]),
			thread: 0,
			threadStats: statsBuffer,
			dataDir: "/tmp",
		},
		counters: openThreadCounters({ buffer: statsBuffer, index: 0 }),
		loop: { lagMs: () => 0 },
		replication: { peers: async () => [] },
		...(secretKeys && {
			secretKeys: { isKnown: () => true, learn() {}, stop() {} },
		}),
		peer: {
			port: 1,
			secret: "p".repeat(64),
			ring: createReplicaRing({
				ctx: { resolver: { peers: async () => [] }, own: () => [HOST] },
			}),
		},
	} as never;
};

type Variant = (request: Request) => Response | Promise<Response>;

const jsonHeaders = { "content-type": "application/json" };

/** createAtomApp's check route rebuilt without the layers named, to price each one by leaving it out. */
const atomWithout = (without: string[]): Variant => {
	const ctx = httpContextOf({ secretKeys: false });
	const app = new Hono();
	const keep = (name: string) => !without.includes(name);
	if (keep("admission"))
		app.use("/v1/balances.check", admissionMiddleware({ ctx }));
	if (keep("requestLog"))
		app.use(
			requestLogMiddleware({
				ctx,
				handleError: (e) => Promise.reject(e) as never,
			}),
		);
	app.use(requestBodyMiddleware);
	const route = [
		...(keep("checkHop") ? [checkHopMiddleware({ ctx })] : []),
		clientAuthMiddleware({ ctx }),
		receiveCheck,
	] as never[];
	if (keep("subApp")) {
		const authorized = new Hono();
		(authorized.post as (...args: unknown[]) => void)(
			"/balances.check",
			...route,
		);
		app.route("/v1", authorized);
	} else
		(app.post as (...args: unknown[]) => void)("/v1/balances.check", ...route);
	return (request) => app.fetch(request) as Promise<Response>;
};

const VARIANTS: Record<string, () => Variant> = {
	/** Bun.serve answering a fixed body: native parse, the Request and Response objects, the write. */
	bare: () => () =>
		new Response(RESPONSE_JSON, { status: 200, headers: jsonHeaders }),
	/** + the body read and parsed, as requestBodyMiddleware does. */
	bareBody: () => async (request) => {
		JSON.parse(await request.text());
		return new Response(RESPONSE_JSON, { status: 200, headers: jsonHeaders });
	},
	/** + Bun.serve's native route table instead of a fetch handler. */
	nativeRoute: () => () =>
		new Response(RESPONSE_JSON, { status: 200, headers: jsonHeaders }),
	/** The production check route: createAtomApp, its fetch timed as honoRoute as createAtomServer does. */
	atom: () => {
		const app = createAtomApp({ ctx: httpContextOf({ secretKeys: false }) });
		return (request) => timeStage("honoRoute", () => app.fetch(request));
	},
	/** As staging: the org's secret key in Authorization, hashed per request. */
	atomSecretKey: () => {
		const app = createAtomApp({ ctx: httpContextOf({ secretKeys: true }) });
		return (request) => timeStage("honoRoute", () => app.fetch(request));
	},
	/** The same route without the clock, to price timeStage itself. */
	atomUntimed: () => atomWithout([]),
	atomNoLog: () => atomWithout(["requestLog"]),
	atomNoAdmission: () => atomWithout(["admission"]),
	atomNoHop: () => atomWithout(["checkHop"]),
	atomNoSubApp: () => atomWithout(["subApp"]),
	atomMinimal: () =>
		atomWithout(["requestLog", "admission", "checkHop", "subApp"]),
};

const serve = (variant: string) => {
	const handler = VARIANTS[variant]?.();
	if (!handler) throw new Error(`unknown variant ${variant}`);
	let cpuAtReset = threadCpuNs();
	let served = 0;
	let clockAtReset = readStageClock({ aliveUs: 0 });
	const control = (pathname: string) => {
		if (pathname === "/__bench/reset") {
			cpuAtReset = threadCpuNs();
			clockAtReset = readStageClock({ aliveUs: 0 });
			served = 0;
			return new Response(null, { status: 204 });
		}
		const clock = readStageClock({ aliveUs: 0 });
		return Response.json({
			served,
			cpuNs: threadCpuNs() - cpuAtReset,
			stageClockUs: Object.fromEntries(
				Object.entries(clock).map(([k, v]) => [k, v - (clockAtReset[k] ?? 0)]),
			),
		});
	};
	if (variant === "nativeRoute")
		Bun.serve({
			hostname: HOST,
			port: PORT,
			routes: {
				"/v1/balances.check": {
					POST: () => {
						served++;
						return handler(undefined as never);
					},
				},
				"/__bench/reset": () => control("/__bench/reset"),
				"/__bench/stats": () => control("/__bench/stats"),
			},
			fetch: () => new Response(null, { status: 404 }),
		});
	else
		Bun.serve({
			hostname: HOST,
			port: PORT,
			fetch: (request) => {
				// Control requests are told apart by their method alone, so the measured path parses no URL here.
				if (request.method === "GET")
					return control(new URL(request.url).pathname);
				served++;
				return handler(request);
			},
		});
	process.on("SIGTERM", () => process.exit(0));
	console.log("ready");
};

const drive = async ({
	variant,
	rate,
	seconds,
}: {
	variant: string;
	rate: number;
	seconds: number;
}) => {
	const server = Bun.spawn(
		[
			process.execPath,
			"--config=./bunfig.toml",
			...(process.env.BENCH_CPU_PROF
				? [
						"--cpu-prof",
						"--cpu-prof-interval=100",
						`--cpu-prof-dir=${process.env.BENCH_CPU_PROF}`,
					]
				: []),
			import.meta.path,
			"serve",
			variant,
		],
		{ stdout: "pipe", stderr: "inherit", env: process.env },
	);
	const reader = server.stdout.getReader();
	let seen = "";
	while (!seen.includes("ready"))
		seen += new TextDecoder().decode((await reader.read()).value);
	const secretKey = variant === "atomSecretKey";
	const headers = {
		"content-type": "application/json",
		"x-api-version": "2.2.0",
		...(secretKey
			? { authorization: `Bearer ${SECRET_KEY}` }
			: { "x-atom-token": ATOM_TOKEN }),
	};
	const url = `http://${HOST}:${PORT}/v1/balances.check`;
	const send = () => {
		const at = performance.now();
		return fetch(url, { method: "POST", headers, body: REQUEST_BODY }).then(
			async (reply) => {
				const text = await reply.text();
				return {
					ms: performance.now() - at,
					ok: reply.status === 200 && text === RESPONSE_JSON,
				};
			},
		);
	};
	const warmupMs = 2_000;
	const totalMs = warmupMs + seconds * 1000;
	const results: Promise<{ ms: number; ok: boolean }>[] = [];
	const startedAt = performance.now();
	let sent = 0;
	let measuring = false;
	while (performance.now() - startedAt < totalMs) {
		const elapsed = performance.now() - startedAt;
		if (!measuring && elapsed >= warmupMs) {
			measuring = true;
			await fetch(`http://${HOST}:${PORT}/__bench/reset`);
		}
		for (const due = Math.floor((elapsed / 1000) * rate); sent < due; sent++) {
			const reply = send();
			if (measuring) results.push(reply);
		}
		await Bun.sleep(1);
	}
	const settled = await Promise.all(results);
	const stats = (await (
		await fetch(`http://${HOST}:${PORT}/__bench/stats`)
	).json()) as {
		served: number;
		cpuNs: number;
		stageClockUs: Record<string, number>;
	};
	const sorted = settled.map(({ ms }) => ms).sort((a, b) => a - b);
	const pct = (p: number) =>
		Number((sorted[Math.floor(sorted.length * p)] ?? 0).toFixed(2));
	console.log(
		JSON.stringify({
			variant,
			rate,
			seconds,
			requests: settled.length,
			failed: settled.filter(({ ok }) => !ok).length,
			p50Ms: pct(0.5),
			p99Ms: pct(0.99),
			cpuUsPerRequest: Number((stats.cpuNs / 1000 / stats.served).toFixed(1)),
			stageUsPerRequest: Object.fromEntries(
				Object.entries(stats.stageClockUs)
					.filter(
						([k, v]) =>
							v > 0 && !k.includes("Idle") && !k.includes("OtherBusy"),
					)
					.map(([k, v]) => [k, Number((v / stats.served).toFixed(1))]),
			),
		}),
	);
	server.kill("SIGTERM");
	await server.exited;
	process.exit(0);
};

if (process.argv[2] === "serve") serve(process.argv[3] as string);
else
	await drive({
		variant: process.argv[2] ?? "atom",
		rate: Number(process.argv[3] ?? 2_000),
		seconds: Number(process.argv[4] ?? 10),
	});
