import { HTTPClient } from "../../lib/http.js";
import { rebaseURL } from "./edgeURLs.js";

/** Set on every reply the Autumn API gave through the edge, its errors included: that call may already have landed. */
const FORWARDED_HEADER = "x-atom-forwarded";

/** The edge answers in milliseconds; past this, the call's remaining time goes to the Autumn API. */
const EDGE_TIMEOUT_MS = 1_000;

type EdgeBases = { autumn: string; edge: string };

const edgeClients = new WeakSet<HTTPClient>();

/** A 5xx the edge answered itself, or the SDK's 555 for no reply: the Autumn API never saw the call. */
const isEdgeDown = (response: Response): boolean =>
	response.status >= 500 && !response.headers.has(FORWARDED_HEADER);

/** Aborts with the call, or once the edge has had `EDGE_TIMEOUT_MS` to reply. */
const edgeSignalOf = ({ callSignal }: { callSignal: AbortSignal }) => {
	const controller = new AbortController();
	const abortWithCall = () => controller.abort(callSignal.reason);
	if (callSignal.aborted) abortWithCall();
	callSignal.addEventListener("abort", abortWithCall, { once: true });
	const timer = setTimeout(
		() => controller.abort(new DOMException("Edge timed out", "TimeoutError")),
		EDGE_TIMEOUT_MS,
	);
	return { signal: controller.signal, replied: () => clearTimeout(timer) };
};

/** Asks the edge, and the Autumn API instead when the edge is down, slow or unreachable. */
const sendEdgeFirst = async ({
	client,
	request,
	bases,
}: {
	client: HTTPClient;
	request: Request;
	bases: EdgeBases;
}): Promise<Response> => {
	const autumnURL = rebaseURL({
		url: request.url,
		from: bases.edge,
		to: bases.autumn,
	});
	if (!autumnURL) return client.request(request);

	const callSignal = request.signal;
	const init = {
		method: request.method,
		headers: request.headers,
		body: await request.text(),
	};
	const edgeSignal = edgeSignalOf({ callSignal });
	try {
		const reply = await client.request(
			new Request(request.url, { ...init, signal: edgeSignal.signal }),
		);
		edgeSignal.replied();
		if (!isEdgeDown(reply) || callSignal.aborted) return reply;
		await reply.body?.cancel();
	} catch (error) {
		edgeSignal.replied();
		if (callSignal.aborted) throw error;
	}
	return client.request(
		new Request(autumnURL, { ...init, signal: callSignal }),
	);
};

/** `client`, sending calls addressed to the edge edge-first. Idempotent: a derived client isn't wrapped twice. */
export const edgeHTTPClientOf = ({
	client,
	bases,
}: {
	client: HTTPClient;
	bases: EdgeBases;
}): HTTPClient => {
	if (edgeClients.has(client)) return client;
	const edgeClient = new HTTPClient({
		fetcher: (input, init) =>
			sendEdgeFirst({ client, request: new Request(input, init), bases }),
	});
	edgeClients.add(edgeClient);
	return edgeClient;
};
