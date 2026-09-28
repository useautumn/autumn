import type { Transport } from "../api/client.ts";

type MockServer = typeof import("./mockServer.ts");

let server: Promise<MockServer> | undefined;
const load = () => {
	server ??= import("./mockServer.ts");
	return server;
};

/** In-browser fake of the twd API, loaded lazily so real builds never ship it. */
export const createMockTransport = (): Transport => ({
	signInUrl: "/sign-in?mock=1",
	request: async (args) => {
		const { handle } = await load();
		await new Promise((r) => setTimeout(r, 80 + Math.random() * 160));
		return handle(args);
	},
	subscribe: ({ path, onMessage }) => {
		let unsubscribe: (() => void) | undefined;
		let closed = false;
		load().then(({ subscribe }) => {
			if (!closed) unsubscribe = subscribe({ path, onMessage });
		});
		return () => {
			closed = true;
			unsubscribe?.();
		};
	},
});
