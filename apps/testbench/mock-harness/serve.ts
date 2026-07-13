/**
 * Serves the built dashboard (dist/) with a mock same-origin /ws snapshot feed,
 * so chart rendering can be exercised without a live swarm run.
 * Usage: bun run mock-harness/serve.ts (after `bun run build`). PORT env optional.
 */
import { join } from "node:path";
import { buildMockSnapshot } from "./mockSnapshot";

const DIST = join(import.meta.dir, "..", "dist");
const PORT = Number.parseInt(process.env.PORT || "5915", 10);

// ERRORS=1 mirrors the real server's errors feed: a persistent server-side
// buffer that grows over time, replayed on subscribeErrors, chunks relayed
// only to subscribed sockets (same semantics as dashboard/server.ts + hub.ts).
const errorsEnabled = process.env.ERRORS === "1";
let errorsBuffer = "";
let errorSeq = 0;
type WsData = {
	interval?: ReturnType<typeof setInterval>;
	subErrors?: boolean;
};
const sockets = new Set<Bun.ServerWebSocket<WsData>>();
if (errorsEnabled) {
	setInterval(() => {
		errorSeq++;
		const longLocation = `server/tests/integration/billing/attach/upgrades/prorations/very/deep/path/segment/another/file${errorSeq}.test.ts:412:17 — expected subscription.items[0].price.unit_amount to equal 12345 but received 99999 (customer cus_mock_${errorSeq}, subscription sub_mock_${errorSeq})`;
		const chunk = `\n\x1b[31m✗ server/tests/mock/file${errorSeq}.test.ts\x1b[0m\n    \x1b[31m✗\x1b[0m mock failure #${errorSeq}\n        ${longLocation}\n        expected ${errorSeq} to be ${errorSeq + 1}\n`;
		errorsBuffer += chunk;
		const payload = JSON.stringify({ type: "errorsOutput", chunk });
		for (const socket of sockets) {
			if (socket.data?.subErrors) {
				socket.send(payload);
			}
		}
	}, 1500);
}

const server = Bun.serve<WsData>({
	port: PORT,
	async fetch(req, srv) {
		const url = new URL(req.url);
		if (url.pathname === "/ws") {
			return srv.upgrade(req, { data: {} })
				? undefined
				: new Response("upgrade failed", { status: 400 });
		}
		const path = url.pathname === "/" ? "/index.html" : url.pathname;
		const file = Bun.file(join(DIST, path));
		if (await file.exists()) {
			return new Response(file);
		}
		return new Response(Bun.file(join(DIST, "index.html")));
	},
	websocket: {
		open(ws) {
			sockets.add(ws);
			// PROGRESSIVE=1 mimics a live run: warm phase first, files complete over time.
			const progressive = process.env.PROGRESSIVE === "1";
			// WARM_HIT=exact|stale pins the compact warm-cache-hit state (screenshots).
			const warmHit = process.env.WARM_HIT;
			let tick = 0;
			const send = () => {
				const full = buildMockSnapshot();
				if (warmHit === "exact" || warmHit === "stale") {
					full.phase = "warm";
					full.warmHit = warmHit;
					full.warmStage = -1;
					full.phaseStartedAt = Date.now() - 8000;
					full.activity =
						"[modal] warm cache HIT (tw-warm:ab12cd34ef56) — skipping the entire warm build";
					full.files = [];
					full.completions = [];
					full.run = {
						total: 60,
						done: 0,
						passed: 0,
						failed: 0,
						running: 0,
						retrying: 0,
						skipped: 0,
					};
					full.runStartedAt = null;
				} else if (progressive) {
					if (tick < 2) {
						full.phase = "warm";
						full.files = [];
						full.completions = [];
					} else {
						const visible = Math.min(full.files.length, (tick - 2) * 6);
						full.files = full.files.slice(0, visible);
						full.completions = full.completions.slice(0, visible);
					}
				}
				ws.send(JSON.stringify({ type: "snapshot", data: full }));
				tick++;
			};
			send();
			ws.data.interval = setInterval(send, 500);
		},
		close(ws) {
			sockets.delete(ws);
			clearInterval(ws.data.interval);
		},
		message(ws, raw) {
			// Mirror the real server's subscribeErrors contract (replay-then-stream).
			if (!errorsEnabled) {
				return;
			}
			let msg: { type?: string };
			try {
				msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
			} catch {
				return;
			}
			if (msg.type === "subscribeErrors") {
				ws.data.subErrors = true;
				ws.send(JSON.stringify({ type: "errorsBuffer", output: errorsBuffer }));
			} else if (msg.type === "unsubscribe") {
				ws.data.subErrors = undefined;
			}
		},
	},
});

console.log(`mock testbench dashboard at http://localhost:${server.port}`);
