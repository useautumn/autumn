import type { AfterSuccessContext, AfterSuccessHook } from "./types.js";

const STREAMED_CONTENT_TYPE = /event-stream|jsonl|ndjson/i;

/** Debug logging swallows errors while it reads the body, so read it here where a timeout still rejects the call. */
export class BufferLoggedResponseHook implements AfterSuccessHook {
	async afterSuccess(
		hookCtx: AfterSuccessContext,
		response: Response,
	): Promise<Response> {
		const contentType = response.headers.get("content-type") ?? "";
		if (
			!hookCtx.options.debugLogger ||
			STREAMED_CONTENT_TYPE.test(contentType)
		) {
			return response;
		}

		await response.clone().arrayBuffer();
		return response;
	}
}
