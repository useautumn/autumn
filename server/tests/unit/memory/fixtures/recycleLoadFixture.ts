// Cluster fixture for drain-safety under concurrency: real in-flight tracking
// so the drain extends instead of cutting requests, plus a slow endpoint whose
// response spans a whole recycle.
import cluster from "node:cluster";
import http from "node:http";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	attachPrimaryForkRecycling,
	startWorkerForkRecycling,
} from "@/utils/memory/forkRecycling/attachForkRecycling.js";

const PORT = Number(process.env.FIXTURE_PORT);
const FORKS = Number(process.env.FIXTURE_FORKS ?? 3);
const log = (message: string) => console.log(message);
const fixtureLogger = { info: log, error: log, warn: log } as unknown as Logger;

if (cluster.isPrimary) {
	for (let i = 0; i < FORKS; i++) cluster.fork();

	const forkRecycling = attachPrimaryForkRecycling({
		clusterModule: cluster,
		shouldRespawn: () => true,
		logger: fixtureLogger,
	});

	cluster.on("listening", (worker) => {
		console.log(`WORKER_UP ${worker.process.pid}`);
	});

	cluster.on("exit", (worker, code, signal) => {
		if (forkRecycling.handleExit(worker)) return;
		console.log(`WORKER_DIED ${worker.process.pid} code=${code} ${signal}`);
	});
} else {
	const drainState = { draining: false };
	let inFlight = 0;

	const server = http.createServer((req, res) => {
		inFlight++;
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const delayMs = Number(url.searchParams.get("ms") ?? 20);
		setTimeout(() => {
			res.setHeader("connection", drainState.draining ? "close" : "keep-alive");
			// Body is length-checked by the test, so a mid-response kill shows up
			// as a truncated read rather than a silent pass.
			res.end(`ok:${process.pid}:${"x".repeat(512)}`);
			inFlight--;
		}, delayMs);
	});

	server.listen(PORT, "127.0.0.1", () => {
		startWorkerForkRecycling({
			server,
			getActiveRequestCount: () => inFlight,
			onDrainStart: () => {
				drainState.draining = true;
			},
			exitGracefully: () => {
				// Mirrors init.ts: a bounded backstop after the drain decides to exit.
				const forceExit = setTimeout(() => process.exit(0), 5_000);
				forceExit.unref?.();
				process.exit(0);
			},
			logger: fixtureLogger,
		});
	});
}
