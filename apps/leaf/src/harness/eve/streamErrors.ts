const retryableMessages = [
	"socket connection was closed unexpectedly",
	"connection reset",
	"fetch failed",
	"other side closed",
	"terminated",
];

export const isRetryableEveStreamError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	return retryableMessages.some((candidate) =>
		message.toLowerCase().includes(candidate),
	);
};

const REHOME_REFUSAL_PATTERN = /cannot deliver inputresponses/i;

/** A non-2xx from an eve session POST — carries the body, which is the only
 * place eve explains itself (e.g. its refusal to re-home input responses). */
export class EveSessionRequestError extends Error {
	readonly body: string;
	readonly status: number;
	constructor({ body, status }: { body: string; status: number }) {
		super(`Eve session request failed: ${status}${body ? ` — ${body}` : ""}`);
		this.name = "EveSessionRequestError";
		this.body = body;
		this.status = status;
	}
}

/** Eve cannot deliver an answer to a request that belonged to a run it has
 * since replaced — the answered tool call is gone, so nothing was written. */
export const isEveInputResponseRehomeRefusal = (error: unknown) =>
	error instanceof EveSessionRequestError &&
	REHOME_REFUSAL_PATTERN.test(error.body);
