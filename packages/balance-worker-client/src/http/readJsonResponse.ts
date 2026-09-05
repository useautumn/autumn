import { HttpResponseError } from "./types/httpClient.js";

export async function readJsonResponse({
	response,
	maxResponseBytes,
}: {
	response: Response;
	maxResponseBytes: number;
}): Promise<unknown> {
	const length = response.headers.get("content-length");
	const encoding = response.headers.get("content-encoding");
	if (
		length !== null &&
		/^(0|[1-9]\d*)$/.test(length) &&
		(!encoding || encoding === "identity")
	) {
		if (Number(length) > maxResponseBytes)
			throw new HttpResponseError("Response body exceeds maxResponseBytes");
		try {
			return await response.json();
		} catch (cause) {
			if (cause instanceof SyntaxError)
				throw new HttpResponseError("Invalid JSON response", { cause });
			throw cause;
		}
	}
	return readBoundedJson({ response, maxResponseBytes });
}

async function readBoundedJson({
	response,
	maxResponseBytes,
}: {
	response: Response;
	maxResponseBytes: number;
}): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) throw new HttpResponseError("Response body is missing");
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	let complete = false;
	try {
		for (;;) {
			const result = await reader.read();
			if (result.done) {
				complete = true;
				break;
			}
			bytes += result.value.byteLength;
			if (bytes > maxResponseBytes)
				throw new HttpResponseError("Response body exceeds maxResponseBytes");
			chunks.push(result.value);
		}
		try {
			return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
		} catch (cause) {
			throw new HttpResponseError("Invalid JSON response", { cause });
		}
	} finally {
		try {
			if (!complete) await reader.cancel();
		} finally {
			reader.releaseLock();
		}
	}
}
