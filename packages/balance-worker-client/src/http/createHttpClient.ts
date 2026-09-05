import { postJson as sendJson } from "./postJson.js";
import type {
	HttpClient,
	HttpClientConfig,
	HttpRequest,
} from "./types/httpClient.js";

export function createHttpClient({
	config,
}: {
	config: HttpClientConfig;
}): HttpClient {
	function postJson(request: HttpRequest) {
		return sendJson({ config, request });
	}
	return { postJson };
}
