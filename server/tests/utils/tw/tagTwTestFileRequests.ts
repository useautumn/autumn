import { TW_TEST_FILE_HEADER } from "@/external/connect/clientCache/twStripeLimiter/twStripeRequestContext.js";

const requestUrl = (input: RequestInfo | URL) =>
	typeof input === "string"
		? input
		: input instanceof URL
			? input.href
			: input.url;

const originOf = (url: string | undefined) => {
	if (!url) return undefined;
	try {
		return new URL(url).origin;
	} catch {
		return undefined;
	}
};

/** bun tw: every call this test file makes to its worker's server carries the file tag, so the server's Stripe calls count against it. */
export const tagTwTestFileRequests = async ({
	fileTag,
	serverUrls,
}: {
	fileTag: string;
	serverUrls: (string | undefined)[];
}) => {
	const origins = new Set(serverUrls.map(originOf).filter(Boolean));
	const originalFetch = globalThis.fetch;
	const taggedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
		if (!origins.has(originOf(requestUrl(input))))
			return originalFetch(input, init);
		const headers = new Headers(
			input instanceof Request ? input.headers : undefined,
		);
		new Headers(init?.headers).forEach((value, name) => {
			headers.set(name, value);
		});
		headers.set(TW_TEST_FILE_HEADER, fileTag);
		return originalFetch(input, { ...init, headers });
	};
	globalThis.fetch = Object.assign(taggedFetch, {
		preconnect: originalFetch.preconnect,
	});

	const { default: axios } = await import("axios");
	axios.defaults.headers.common[TW_TEST_FILE_HEADER] = fileTag;
};
