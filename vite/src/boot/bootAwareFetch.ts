import axios, { type AxiosAdapter, AxiosHeaders } from "axios";
import {
	type BootResponse,
	bootRequestKey,
	takeBootResponse,
} from "./bootRequests";

const isOk = (response: BootResponse | null | undefined) =>
	!!response && response.status >= 200 && response.status < 300;

const networkAdapter = axios.getAdapter(axios.defaults.adapter);

/** Serves a request from the boot script when it already made the identical one. */
export const bootAwareAxiosAdapter: AxiosAdapter = async (config) => {
	const method = config.method?.toUpperCase() ?? "GET";
	const body = typeof config.data === "string" ? config.data : undefined;
	const boot =
		method === "GET" || (method === "POST" && body)
			? takeBootResponse(
					bootRequestKey({
						method,
						url: axios.getUri(config),
						body,
						env: config.headers.get("app_env")?.toString(),
						sandboxOrgId: config.headers.get("x-sandbox-org-id")?.toString(),
						apiVersion: config.headers.get("x-api-version")?.toString(),
					}),
				)
			: undefined;
	const response = boot && (await boot);
	if (!response || !isOk(response)) return networkAdapter(config);
	return {
		data: response.body,
		status: response.status,
		statusText: "OK",
		headers: new AxiosHeaders(response.headers),
		config,
		request: null,
	};
};

/** better-auth's fetch, answering the first session check from the boot script. */
export const bootAwareFetch = async (
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const isGet = (init?.method ?? "GET").toUpperCase() === "GET";
	const boot =
		isGet && (typeof input === "string" || input instanceof URL)
			? takeBootResponse(bootRequestKey({ url: input.toString() }))
			: undefined;
	const response = boot && (await boot);
	if (!response || !isOk(response)) return fetch(input, init);
	return new Response(response.body, {
		status: response.status,
		headers: response.headers,
	});
};
