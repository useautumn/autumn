import type { RequestInput } from "../lib/http.js";
import type { EdgeSDKOptions } from "./edge/types/edgeSDKOptions.js";
import type {
	BeforeCreateRequestContext,
	BeforeCreateRequestHook,
} from "./types.js";

const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** A check that deducts, as sent on the wire: `send_event` or a lock. */
const isWriteCheck = ({
	operationID,
	body,
}: {
	operationID: string;
	body: RequestInit["body"];
}): boolean => {
	if (operationID !== "check" || typeof body !== "string") return false;
	try {
		const sent: { send_event?: unknown; lock?: unknown } = JSON.parse(body);
		return sent.send_event === true || sent.lock !== undefined;
	} catch {
		return false;
	}
};

/**
 * Under `useEdge`, a write check carries an Idempotency-Key: the caller's if set, else one made here once per call.
 * Every retry and the edge's fallback resend that same key, so Autumn applies the write once.
 */
export class IdempotencyKeyHook implements BeforeCreateRequestHook {
	beforeCreateRequest(
		hookCtx: BeforeCreateRequestContext,
		input: RequestInput,
	): RequestInput {
		const options: EdgeSDKOptions = hookCtx.options;
		if (!options.useEdge) return input;
		if (
			!isWriteCheck({
				operationID: hookCtx.operationID,
				body: input.options?.body,
			})
		)
			return input;
		const headers = new Headers(input.options?.headers);
		if (headers.has(IDEMPOTENCY_KEY_HEADER)) return input;
		headers.set(IDEMPOTENCY_KEY_HEADER, crypto.randomUUID());
		return { ...input, options: { ...input.options, headers } };
	}
}
