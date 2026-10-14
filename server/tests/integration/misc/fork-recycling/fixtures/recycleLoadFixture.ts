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
	const openSockets = new Set<import("node:net").Socket>();

	const server = http.createServer((req, res) => {
		inFlight++;
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			inFlight--;
		};
		res.on("finish", release);
		res.on("close", release);
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const delayMs = Number(url.searchParams.get("ms") ?? 20);
		setTimeout(() => {
			res.setHeader("connection", drainState.draining ? "close" : "keep-alive");
			res.end(`ok:${process.pid}:${"x".repeat(512)}`);
		}, delayMs);
	});

	server.on("connection", (socket) => {
		openSockets.add(socket);
		socket.on("close", () => openSockets.delete(socket));
	});

	server.listen(PORT, "127.0.0.1", () => {
		startWorkerForkRecycling({
			server,
			getActiveRequestCount: () => Math.max(inFlight, openSockets.size),
			onDrainStart: () => {
				drainState.draining = true;
			},
			exitGracefully: () => process.exit(0),
			logger: fixtureLogger,
		});
	});
}
