import type { Context } from "hono";
import { ZodError } from "zod/v4";
import { CannotAnswerError } from "../../lib/forward/cannotAnswerError.js";
import { forwardToAutumn } from "../forward/forwardToAutumn.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

/**
 * Where every request Atom did not answer ends up. One it cannot answer is answered by the Autumn API;
 * a push Atom cannot read is the sender's to fix; anything else is Atom's own failure, and is logged.
 */
export const atomErrorHandler = ({ ctx }: { ctx: AtomHttpContext }) =>
	function handleError(cause: Error, context: Context) {
		if (cause instanceof CannotAnswerError)
			return forwardToAutumn({ ctx, context, reason: cause.reason });

		if (cause instanceof ZodError || cause instanceof SyntaxError) {
			return context.json(
				{ message: cause.message, code: "invalid_request" },
				400,
			);
		}
		ctx.logger.error(
			{ error: cause, type: "atom_request_failed" },
			"Atom could not answer a request",
		);
		return context.json(
			{ message: "Atom could not answer", code: "internal_error" },
			500,
		);
	};
