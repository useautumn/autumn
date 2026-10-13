import { isMainThread } from "node:worker_threads";
import { serveAtomApp } from "../../../../src/http/serveAtomApp.js";

/** Started as a thread: a listener whose app, and logger, fail every request; it answers "alive" to any message. */
export const ESCAPING_SERVER = import.meta.path;

if (!isMainThread) {
	const server = serveAtomApp({
		hostname: "127.0.0.1",
		port: 0,
		logger: {
			error: () => {
				throw new Error("injected logger failure");
			},
		},
		fetch: (request) => {
			if (new URL(request.url).pathname === "/async")
				return Promise.reject(new Error("injected async failure"));
			throw new Error("injected failure");
		},
	});
	self.onmessage = () => postMessage("alive");
	postMessage(server.port);
}
