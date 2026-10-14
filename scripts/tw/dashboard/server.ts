import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import { getTuiState, runTallies } from "../tui/store.ts";
import {
	enableHub,
	getCompletions,
	getDurationMs,
	getErrorsOutput,
	getFileOutput,
	getRunStartedAt,
	getWorkerOf,
	getWorkerOutput,
	getWorkers,
	onHubEvent,
	requestSkip,
} from "./hub.ts";

type ClientData = { subFile?: string; subWorker?: string; subErrors?: boolean };

const basename = (path: string): string => path.split("/").pop() ?? path;

export const getDashboardSnapshot = () => {
	const s = getTuiState();
	const t = runTallies();
	return {
		phase: s.phase,
		target: s.target,
		workerCount: s.workers,
		warmActivity: s.warmActivity,
		warmBuilding: s.warmBuilding,
		warmStage: s.warmStage,
		warmHit: s.warmHit,
		phaseStartedAt: s.phaseStartedAt,
		activity: s.lastLine,
		fanout: {
			stripeDone: s.stripeDone,
			stripeTotal: s.stripeTotal,
			workersReady: s.workersReady,
			workersTotal: s.workersTotal,
			workersFailed: s.workersFailed,
		},
		teardown: {
			sandboxesDone: s.sandboxesDone,
			sandboxesTotal: s.sandboxesTotal,
			accountsDone: s.accountsDone,
			accountsTotal: s.accountsTotal,
		},
		run: {
			total: s.runTotal,
			done: t.done,
			passed: t.passed,
			failed: t.failed,
			running: t.running,
			retrying: t.retrying,
			skipped: t.skipped,
		},
		files: Array.from(s.files.values()).map((f) => ({
			file: f.file,
			name: basename(f.file),
			status: f.status,
			passed: f.passed,
			failed: f.failed,
			worker: getWorkerOf(f.file),
			durationMs: getDurationMs(f.file),
			currentTest: f.currentTest,
			attempt: f.attempt,
			passedOnRetry: f.passedOnRetry,
			workerDeaths: f.workerDeaths ?? 0,
			willRetry: f.willRetry,
			failedTests: f.failedTests,
		})),
		workers: getWorkers().map((w) => ({
			name: w.name,
			status: w.status,
			reason: w.reason,
			fileCount: w.files.length,
			files: w.files.map((file) => ({ file, name: basename(file) })),
		})),
		completions: getCompletions(),
		runStartedAt: getRunStartedAt(),
		summary: s.summary ?? null,
		now: Date.now(),
	};
};

export type DashboardServer = {
	url: string;
	webUrl: string;
	port: number;
	servingSpa: boolean;
	stop: () => void;
};

const DIST_DIR = resolve(import.meta.dir, "../../../apps/testbench/dist");
const ASSET_EXT = /\.(js|css|png|svg|ico|woff2?|map|json|txt)$/;

export const startDashboardServer = (): DashboardServer => {
	enableHub();
	const clients = new Set<ServerWebSocket<ClientData>>();
	const servingSpa = existsSync(join(DIST_DIR, "index.html"));

	const server = Bun.serve<ClientData>({
		port: 0,
		fetch(req, srv) {
			const { pathname } = new URL(req.url);
			if (pathname === "/ws") {
				return srv.upgrade(req, { data: {} })
					? undefined
					: new Response("upgrade failed", { status: 500 });
			}
			if (servingSpa) {
				const file = ASSET_EXT.test(pathname)
					? Bun.file(join(DIST_DIR, pathname.slice(1)))
					: Bun.file(join(DIST_DIR, "index.html"));
				return new Response(file);
			}
			return new Response("bun tw dashboard ws — connect to /ws", {
				status: 200,
			});
		},
		websocket: {
			open(ws) {
				clients.add(ws);
				ws.send(
					JSON.stringify({ type: "snapshot", data: getDashboardSnapshot() }),
				);
			},
			close(ws) {
				clients.delete(ws);
			},
			message(ws, raw) {
				let msg: { type: string; file?: string; worker?: string };
				try {
					msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
				} catch {
					return;
				}
				if (msg.type === "subscribeFile" && msg.file) {
					ws.data.subFile = msg.file;
					ws.data.subWorker = undefined;
					ws.send(
						JSON.stringify({
							type: "fileBuffer",
							file: msg.file,
							output: getFileOutput(msg.file),
						}),
					);
				} else if (msg.type === "subscribeWorker" && msg.worker) {
					ws.data.subWorker = msg.worker;
					ws.data.subFile = undefined;
					ws.send(
						JSON.stringify({
							type: "workerBuffer",
							worker: msg.worker,
							output: getWorkerOutput(msg.worker),
						}),
					);
				} else if (msg.type === "subscribeErrors") {
					ws.data.subErrors = true;
					ws.send(
						JSON.stringify({ type: "errorsBuffer", output: getErrorsOutput() }),
					);
				} else if (msg.type === "skipFile" && msg.file) {
					requestSkip(msg.file);
				} else if (msg.type === "unsubscribe") {
					ws.data.subFile = undefined;
					ws.data.subWorker = undefined;
					ws.data.subErrors = undefined;
				}
			},
		},
	});

	const off = onHubEvent((event) => {
		if (event.type === "fileOutput") {
			const payload = JSON.stringify(event);
			for (const ws of clients) {
				if (ws.data.subFile === event.file) {
					ws.send(payload);
				}
			}
		} else if (event.type === "workerOutput") {
			const payload = JSON.stringify(event);
			for (const ws of clients) {
				if (ws.data.subWorker === event.worker) {
					ws.send(payload);
				}
			}
		} else if (event.type === "errorsOutput") {
			const payload = JSON.stringify(event);
			for (const ws of clients) {
				if (ws.data.subErrors) {
					ws.send(payload);
				}
			}
		}
	});

	const interval = setInterval(() => {
		if (clients.size === 0) {
			return;
		}
		const payload = JSON.stringify({
			type: "snapshot",
			data: getDashboardSnapshot(),
		});
		for (const ws of clients) {
			ws.send(payload);
		}
	}, 250);

	const port = server.port ?? 0;
	const url = `http://localhost:${port}`;
	const webUrl = servingSpa
		? url
		: `http://localhost:5910/?ws=${encodeURIComponent(`ws://localhost:${port}/ws`)}`;
	return {
		url,
		webUrl,
		port,
		servingSpa,
		stop: () => {
			clearInterval(interval);
			off();
			server.stop(true);
		},
	};
};
