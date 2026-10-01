import type { ErrorHandler } from "hono";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import { forwardToAutumn } from "../../forward/forwardToAutumn.js";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import { atomErrorOf } from "./atomErrorOf.js";

/**
 * Where every request Atom did not answer ends up. One it cannot answer is answered by the Autumn API;
 * the rest are answered here, and what failed is left for the request line.
 */
export const createAtomErrorHandler = ({
	ctx,
}: {
	ctx: AtomHttpContext;
}): ErrorHandler<AtomHttpEnv> =>
	function handleError(cause, context) {
		if (cause instanceof CannotAnswerError)
			return forwardToAutumn({ ctx, context, reason: cause.reason });

		const { status, code, message } = atomErrorOf({ cause });
		context.set("failure", { code, error: cause });
		return context.json({ message, code }, status);
	};
