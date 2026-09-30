import { LiveClientMessage } from "../../../src/api/contract.ts";
import type { Transport } from "../api/client.ts";

type MockServer = typeof import("./mockServer.ts");

let server: Promise<MockServer> | undefined;
const load = () => {
	server ??= import("./mockServer.ts");
	return server;
};

const later = (fn: () => void, ms = 0) => setTimeout(fn, ms);

/** In-browser fake of the twd API, loaded lazily so real builds never ship it. */
export const createMockTransport = (): Transport => ({
	signInUrl: "/sign-in?mock=1",
	request: async (args) => {
		const { handle, flush } = await load();
		await new Promise((r) => setTimeout(r, 80 + Math.random() * 160));
		const res = handle(args);
		if (args.method !== "GET") later(flush);
		return res;
	},
	openLive: ({ onOpen, onMessage }) => {
		let closed = false;
		let conn: ReturnType<MockServer["connectLive"]> | undefined;
		load().then(({ connectLive }) => {
			if (closed) return;
			later(() => {
				if (closed) return;
				onOpen();
				conn = connectLive((msg) => {
					const text = JSON.stringify(msg);
					later(() => !closed && onMessage(text));
				});
			}, 150);
		});
		return {
			send: (text) => {
				const msg = LiveClientMessage.parse(JSON.parse(text));
				later(() => conn?.receive(msg));
			},
			close: () => {
				closed = true;
				conn?.close();
			},
		};
	},
});
