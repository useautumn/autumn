import { gzipSync } from "node:zlib";

const EVENTS_API_PATH = "/v0/events";

const urlOf = (input: URL | RequestInfo): string => {
	if (typeof input === "string") return input;
	return input instanceof URL ? input.href : input.url;
};

/** The SDK posts NDJSON uncompressed; this gzips Events API bodies and passes everything else through. */
export const createGzipEventsFetch = ({
	fetch: innerFetch,
}: {
	fetch: typeof fetch;
}): typeof fetch => {
	const gzipEventsFetch = (
		input: URL | RequestInfo,
		init?: RequestInit,
	): Promise<Response> => {
		const body = init?.body;
		const isEventsPost =
			init?.method === "POST" && urlOf(input).includes(EVENTS_API_PATH);
		if (!isEventsPost || typeof body !== "string") {
			return innerFetch(input, init);
		}
		const headers = new Headers(init?.headers);
		headers.set("Content-Encoding", "gzip");
		return innerFetch(input, { ...init, headers, body: gzipSync(body) });
	};
	return gzipEventsFetch as typeof fetch;
};
