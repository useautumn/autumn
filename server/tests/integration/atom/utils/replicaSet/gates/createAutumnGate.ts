import { ATOM_TRACKS_APPEND_PATH } from "@autumn/byoc";
import { proxyRequest } from "../proxyRequest.js";
import { createRequestGate } from "./createRequestGate.js";

/**
 * Where the set's replicas reach Autumn: every request goes straight on, except the journal's hand-ins, which wait while
 * the gate is shut and reach Autumn in order once it opens, each replica still waiting for its reply.
 */
export const createAutumnGate = ({
	autumnApiUrl,
}: {
	autumnApiUrl: string;
}) => {
	const handIns = createRequestGate();

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			// Read now: a held request's body is gone by the time the gate opens.
			const body = await request.arrayBuffer();
			const send = () =>
				proxyRequest({ targetUrl: autumnApiUrl, request, body });
			const isHandIn =
				new URL(request.url).pathname === ATOM_TRACKS_APPEND_PATH;
			return isHandIn ? handIns.pass({ send }) : send();
		},
	});

	return {
		url: `http://127.0.0.1:${server.port}`,
		handIns,
		stop: () => server.stop(true),
	};
};

export type AutumnGate = ReturnType<typeof createAutumnGate>;
