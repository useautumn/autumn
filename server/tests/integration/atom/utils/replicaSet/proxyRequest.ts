/** Passes a request on to `targetUrl` as it came, and its reply back. */
export const proxyRequest = async ({
	targetUrl,
	request,
	body,
}: {
	targetUrl: string;
	request: Request;
	body: ArrayBuffer;
}): Promise<Response> => {
	const { pathname, search } = new URL(request.url);
	const headers = new Headers(request.headers);
	headers.delete("host");
	const response = await fetch(`${targetUrl}${pathname}${search}`, {
		method: request.method,
		headers,
		body: request.method === "GET" ? undefined : body,
	});
	// fetch already decoded the body, so its encoding and length no longer describe it.
	const replyHeaders = new Headers(response.headers);
	replyHeaders.delete("content-encoding");
	replyHeaders.delete("content-length");
	return new Response(await response.arrayBuffer(), {
		status: response.status,
		headers: replyHeaders,
	});
};
