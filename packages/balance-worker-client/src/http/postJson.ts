import { readJsonResponse } from "./readJsonResponse.js";
import {
	type HttpClientConfig,
	type HttpRequest,
	type HttpResponse,
	HttpResponseError,
} from "./types/httpClient.js";

export async function postJson({
	config,
	request,
}: {
	config: HttpClientConfig;
	request: HttpRequest;
}): Promise<HttpResponse> {
	request.signal.throwIfAborted();
	const response = await fetch(request.url, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify(request.body),
		signal: request.signal,
		redirect: "manual",
	});
	try {
		if (response.status >= 300 && response.status < 400)
			throw new HttpResponseError("HTTP redirects are not accepted");
		const contentType = response.headers
			.get("content-type")
			?.split(";", 1)[0]
			?.trim()
			.toLowerCase();
		if (contentType !== "application/json")
			throw new HttpResponseError("Expected a JSON response");
		const body = await readJsonResponse({
			response,
			maxResponseBytes: config.maxResponseBytes,
		});
		request.signal.throwIfAborted();
		return { status: response.status, body };
	} finally {
		if (!response.bodyUsed) await response.body?.cancel();
	}
}
