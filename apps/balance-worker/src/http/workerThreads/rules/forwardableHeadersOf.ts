/** Hop-by-hop or connection-bound headers a request rebuilt on the decide thread must not carry. */
const DROPPED_HEADERS = new Set([
	"host",
	"content-length",
	"connection",
	"transfer-encoding",
	"keep-alive",
	"expect",
]);

export const forwardableHeadersOf = ({
	headers,
}: {
	headers: Headers;
}): [string, string][] => {
	const forwardable: [string, string][] = [];
	headers.forEach((value, name) => {
		if (!DROPPED_HEADERS.has(name)) forwardable.push([name, value]);
	});
	return forwardable;
};
