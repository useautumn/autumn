/**
 * Serves the built dashboard (dist/) with a mock same-origin /ws snapshot feed,
 * so chart rendering can be exercised without a live swarm run.
 * Usage: bun run mock-harness/serve.ts (after `bun run build`). PORT env optional.
 */
import { join } from "node:path";
import { buildMockSnapshot } from "./mockSnapshot";

const DIST = join(import.meta.dir, "..", "dist");
const PORT = Number.parseInt(process.env.PORT || "5915", 10);

const server = Bun.serve({
	port: PORT,
	async fetch(req, srv) {
		const url = new URL(req.url);
		if (url.pathname === "/ws") {
			return srv.upgrade(req)
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
			// PROGRESSIVE=1 mimics a live run: warm phase first, files complete over time.
			const progressive = process.env.PROGRESSIVE === "1";
			let tick = 0;
			const send = () => {
				const full = buildMockSnapshot();
				if (progressive) {
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
			const interval = setInterval(send, 500);
			ws.data = interval as unknown as undefined;
		},
		close(ws) {
			clearInterval(ws.data as unknown as ReturnType<typeof setInterval>);
		},
		message() {
			// snapshots are pushed on a timer; client messages need no reply
		},
	},
});

console.log(`mock testbench dashboard at http://localhost:${server.port}`);
