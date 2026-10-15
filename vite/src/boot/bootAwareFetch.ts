import axios, {
	type AxiosAdapter,
	AxiosError,
	AxiosHeaders,
	type AxiosResponse,
} from "axios";
import { bootRequestKey, takeBootResponse } from "./bootResponses";

const networkAdapter = axios.getAdapter(axios.defaults.adapter);

/** Serves a request from the boot script when it already made the identical one. */
export const bootAwareAxiosAdapter: AxiosAdapter = async (config) => {
	const response = await takeBootResponse(
		bootRequestKey({
			method: config.method,
			url: axios.getUri(config),
			body: typeof config.data === "string" ? config.data : undefined,
			env: config.headers.get("app_env")?.toString(),
			sandboxOrgId: config.headers.get("x-sandbox-org-id")?.toString(),
			apiVersion: config.headers.get("x-api-version")?.toString(),
		}),
	);
	// No boot response, or the boot fetch itself failed: go to the network.
	if (!response) return networkAdapter(config);

	const axiosResponse: AxiosResponse = {
		data: response.body,
		status: response.status,
		statusText: "",
		headers: new AxiosHeaders(response.headers),
		config,
		request: null,
	};
	// Same outcome as the network adapter: error statuses reject, so a 404 isn't fetched twice.
	if (config.validateStatus && !config.validateStatus(response.status))
		throw new AxiosError(
			`Request failed with status code ${response.status}`,
			response.status >= 500
				? AxiosError.ERR_BAD_RESPONSE
				: AxiosError.ERR_BAD_REQUEST,
			config,
			null,
			axiosResponse,
		);
	return axiosResponse;
};

/** better-auth's fetch, answering the first session check from the boot script. */
export const bootAwareFetch = async (
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const response =
		input instanceof Request
			? undefined
			: await takeBootResponse(
					bootRequestKey({ method: init?.method, url: input.toString() }),
				);
	if (!response) return fetch(input, init);
	return new Response(response.body, {
		status: response.status,
		headers: response.headers,
	});
};
