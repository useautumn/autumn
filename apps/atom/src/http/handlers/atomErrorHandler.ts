import type { Context } from "hono";
import { ZodError } from "zod/v4";
import type { AtomHttpContext } from "../types/atomHttp.js";

/** A body Atom cannot read is the caller's to fix; anything else is Atom's, and is logged. */
export const atomErrorHandler = ({ ctx }: { ctx: AtomHttpContext }) =>
	function handleError(cause: Error, context: Context) {
		if (cause instanceof ZodError || cause instanceof SyntaxError) {
			return context.json(
				{ error: { code: "invalid_request", message: cause.message } },
				400,
			);
		}
		ctx.logger.error(
			{ error: cause, type: "atom_request_failed" },
			"Atom could not answer a request",
		);
		return context.json(
			{ error: { code: "internal", message: "Atom could not answer" } },
			500,
		);
	};
