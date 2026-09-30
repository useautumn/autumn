import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Throw from any handler/action; the app's onError renders it as the ApiError envelope. */
export class TwdError extends Error {
	readonly status: ContentfulStatusCode;
	readonly code: string;
	readonly next: string;
	readonly escalate: string | null;
	readonly details?: Record<string, unknown>;

	constructor(args: {
		status: ContentfulStatusCode;
		code: string;
		message: string;
		next: string;
		escalate?: string;
		details?: Record<string, unknown>;
	}) {
		super(args.message);
		this.status = args.status;
		this.code = args.code;
		this.next = args.next;
		this.escalate = args.escalate ?? null;
		this.details = args.details;
	}
}

export const renderTwdError = ({ c, error }: { c: Context; error: TwdError }) =>
	c.json(
		{
			error: {
				code: error.code,
				message: error.message,
				next: error.next,
				escalate: error.escalate,
				details: error.details,
			},
		},
		error.status,
	);
