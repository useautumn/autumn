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

const snapshot = () => {
	const s = getTuiState();
	const t = runTallies();
	return {
		phase: s.phase,
		target: s.target,
		workerCount: s.workers,
		// Warm-up liveness: latest activity line + monotonic stage + phase clock.
		warmActivity: s.warmActivity,
		warmBuilding: s.warmBuilding,
		warmStage: s.warmStage,
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
	/** Base HTTP origin (also the WS origin). */
	url: string;
	/** The openable browser URL: the served SPA when built, else the dev-server combo. */
	webUrl: string;
	port: number;
	/** Whether the built dashboard SPA is being served same-origin. */
	servingSpa: boolean;
	stop: () => void;
};

/** Built dashboard SPA dir (apps/testbench/dist), relative to this file. */
const DIST_DIR = resolve(import.meta.dir, "../../../apps/testbench/dist");
const ASSET_EXT = /\.(js|css|png|svg|ico|woff2?|map|json|txt)$/;

/** Start the dashboard WS server on a random port. Enables the data hub. */
export const startDashboardServer = (): DashboardServer => {
	enableHub();
	const clients = new Set<ServerWebSocket<ClientData>>();
	// Serve the built SPA same-origin (one-click) when it exists; the app then
	// connects to ws://<same-host>/ws with no query param needed.
	const servingSpa = existsSync(join(DIST_DIR, "index.html"));

	const server = Bun.serve<ClientData>({
		port: 0, // random
		fetch(req, srv) {
			const { pathname } = new URL(req.url);
			if (pathname === "/ws") {
				return srv.upgrade(req, { data: {} })
					? undefined
					: new Response("upgrade failed", { status: 500 });
			}
			if (servingSpa) {
				// Static asset by extension; otherwise SPA fallback to index.html.
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
				} else if (msg.type === "subscribeErrors") {
					// Independent of the file/worker sub — the errors feed is its own pane.
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
		} else if (event.type === "errorsOutput") {
			const payload = JSON.stringify(event);
			for (const ws of clients) {
				if (ws.data.subErrors) {
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
	const url = `http://localhost:${port}`;
	// One-click when the SPA is built (served same-origin); otherwise point at the
	// testbench dev server (5910) with the ws origin in the query string.
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
