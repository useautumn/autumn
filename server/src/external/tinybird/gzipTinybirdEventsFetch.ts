import { gzipSync } from "node:zlib";

const gzipEventsFetch = (
	input: URL | RequestInfo,
	init?: RequestInit,
): Promise<Response> => {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	const isEventsPost =
		init?.method === "POST" &&
		url.includes("/v0/events") &&
		typeof init.body === "string";
	if (!isEventsPost) return fetch(input, init);

	const headers = new Headers(init.headers);
	headers.set("Content-Encoding", "gzip");
	return fetch(input, {
		...init,
		headers,
		body: gzipSync(init?.body as string),
	});
};

/** Fetch for Tinybird clients that gzips events-API POST bodies — the SDK
 * sends them uncompressed, which at 5k-row migration pages is a ~26 MB upload. */
export const gzipTinybirdEventsFetch = gzipEventsFetch as typeof fetch;
