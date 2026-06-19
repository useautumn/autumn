/**
 * Dashboard WebSocket server for `bun tw` (consumed by apps/testbench).
 *
 * Bun's built-in WS server on a RANDOM port. Protocol:
 *   server → client:
 *     { type: "snapshot", data }              every 250ms + on connect (metadata only)
 *     { type: "fileBuffer", file, output }     on subscribeFile (full current buffer)
 *     { type: "fileOutput", file, chunk }      streamed while subscribed to that file
 *     { type: "workerBuffer", worker, output } on subscribeWorker
 *     { type: "workerOutput", worker, chunk }  streamed while subscribed to that worker
 *   client → server:
 *     { type: "subscribeFile", file } | { type: "subscribeWorker", worker } | { type: "unsubscribe" }
 *
 * The snapshot is metadata only (phase, progress, per-file pass/fail, worker list,
 * completions, summary) — raw test/server output is streamed on demand so the
 * snapshot stays small even with 189 files × 50 workers.
 */

import type { ServerWebSocket } from "bun";
import { getTuiState, runTallies } from "../tui/store.ts";
import {
	enableHub,
	getCompletions,
	getFileOutput,
	getWorkerOf,
	getWorkerOutput,
	getWorkers,
	onHubEvent,
} from "./hub.ts";

type ClientData = { subFile?: string; subWorker?: string };

const basename = (path: string): string => path.split("/").pop() ?? path;

const snapshot = () => {
	const s = getTuiState();
	const t = runTallies();
	return {
		phase: s.phase,
		target: s.target,
		workerCount: s.workers,
		fanout: {
			stripeDone: s.stripeDone,
			stripeTotal: s.stripeTotal,
			workersReady: s.workersReady,
			workersTotal: s.workersTotal,
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
		},
		files: Array.from(s.files.values()).map((f) => ({
			file: f.file,
			name: basename(f.file),
			status: f.status,
			passed: f.passed,
			failed: f.failed,
			worker: getWorkerOf(f.file),
			currentTest: f.currentTest,
			willRetry: f.willRetry,
			failedTests: f.failedTests,
		})),
		workers: getWorkers().map((w) => ({
			name: w.name,
			status: w.status,
			fileCount: w.files.length,
			files: w.files.map((file) => ({ file, name: basename(file) })),
		})),
		completions: getCompletions(),
		summary: s.summary ?? null,
		now: Date.now(),
	};
};

export type DashboardServer = { url: string; port: number; stop: () => void };

/** Start the dashboard WS server on a random port. Enables the data hub. */
export const startDashboardServer = (): DashboardServer => {
	enableHub();
	const clients = new Set<ServerWebSocket<ClientData>>();

	const server = Bun.serve<ClientData>({
		port: 0, // random
		fetch(req, srv) {
			const { pathname } = new URL(req.url);
			if (pathname === "/ws") {
				return srv.upgrade(req, { data: {} })
					? undefined
					: new Response("upgrade failed", { status: 500 });
			}
			return new Response("bun tw dashboard ws — connect to /ws", {
				status: 200,
			});
		},
		websocket: {
			open(ws) {
				clients.add(ws);
				ws.send(JSON.stringify({ type: "snapshot", data: snapshot() }));
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
				} else if (msg.type === "unsubscribe") {
					ws.data.subFile = undefined;
					ws.data.subWorker = undefined;
				}
			},
		},
	});

	// Stream output chunks only to the clients subscribed to that file/worker.
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
		}
	});

	// Periodic metadata broadcast (cheap; raw output isn't included).
	const interval = setInterval(() => {
		if (clients.size === 0) {
			return;
		}
		const payload = JSON.stringify({ type: "snapshot", data: snapshot() });
		for (const ws of clients) {
			ws.send(payload);
		}
	}, 250);

	const port = server.port ?? 0;
	return {
		url: `http://localhost:${port}`,
		port,
		stop: () => {
			clearInterval(interval);
			off();
			server.stop(true);
		},
	};
};
