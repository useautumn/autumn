import type { z } from "zod/v4";
import type { AlienApi } from "../types/alienApi.js";
import { AlienRequestError } from "./alienRequestError.js";

const NO_CONTENT = 204;

const sendRequest = async ({
	api,
	method,
	path,
	body,
}: {
	api: AlienApi;
	method: "GET" | "POST" | "DELETE";
	path: string;
	body?: unknown;
}): Promise<Response> => {
	try {
		return await fetch(`${api.baseUrl}${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				...(api.apiKey && { Authorization: `Bearer ${api.apiKey}` }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch (error) {
		throw new AlienRequestError({ path, status: null, detail: String(error) });
	}
};

/** One call to an alien manager, parsed against the shape we rely on. */
export const alienRequest = async <Schema extends z.ZodType>({
	api,
	method,
	path,
	body,
	schema,
}: {
	api: AlienApi;
	method: "GET" | "POST" | "DELETE";
	path: string;
	body?: unknown;
	schema: Schema;
}): Promise<z.infer<Schema>> => {
	const response = await sendRequest({ api, method, path, body });
	if (!response.ok)
		throw new AlienRequestError({
			path,
			status: response.status,
			detail: await response.text(),
		});
	const hasNoContent = response.status === NO_CONTENT;
	return schema.parse(hasNoContent ? null : await response.json());
};
