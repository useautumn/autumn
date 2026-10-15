import type { Context, ErrorHandler } from "hono";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import { CustomerMovedError } from "../../../processor/ownership/customerMovedError.js";
import { FORWARDED_HEADER } from "../../forward/forwardRequest.js";
import { forwardToAutumn } from "../../forward/forwardToAutumn.js";
import { hopMovedRequest } from "../../forward/hopMovedRequest.js";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import { atomErrorOf } from "./atomErrorOf.js";

/** Forwards waiting on the API, per app; past this a check is refused, so a slow API cannot pile up a backlog the loop-lag gate never sees. */
export const MAX_FORWARDS_IN_FLIGHT = 256;

/**
 * Where every request Atom did not answer ends up. One it cannot answer is answered by the Autumn API;
 * the rest are answered here, and what failed is left for the request line.
 */
export const createAtomErrorHandler = ({
	ctx,
}: {
	ctx: AtomHttpContext;
}): ErrorHandler<AtomHttpEnv> => {
	let forwarding = 0;

	/** Past the cap: a 503 without x-atom-forwarded, which the SDK takes to the API itself. */
	async function forwardWithinCap(
		context: Context<AtomHttpEnv>,
		reason: ForwardReason,
	): Promise<Response> {
		if (forwarding >= MAX_FORWARDS_IN_FLIGHT) {
			ctx.counters.add("shed");
			return context.json(
				{
					message: "Atom is forwarding all it can; ask the Autumn API",
					code: "atom_overloaded",
				},
				503,
			);
		}
		forwarding += 1;
		try {
			return await forwardToAutumn({ ctx, context, reason });
		} finally {
			forwarding -= 1;
		}
	}

	return async function handleError(cause, context) {
		// An owner out of reach is no verdict on the lock, and the API holds no row for it until its hand-in lands.
		if (
			cause instanceof CannotAnswerError &&
			cause.reason === "owner_unavailable" &&
			context.req.path === "/v1/balances.finalize"
		)
			return context.json(
				{
					message: "The replica that owns this customer is unavailable",
					code: "atom_unavailable",
				},
				503,
				{ [FORWARDED_HEADER]: cause.reason },
			);
		if (cause instanceof CannotAnswerError)
			return forwardWithinCap(context, cause.reason);
		// The customer moved on while this request waited: its owner decides it, or the API when they disagree.
		if (cause instanceof CustomerMovedError) {
			try {
				return await hopMovedRequest({ ctx, context, owner: cause.owner });
			} catch (error) {
				if (error instanceof CannotAnswerError)
					return forwardWithinCap(context, error.reason);
				throw error;
			}
		}

		const { status, code, message } = atomErrorOf({ cause });
		context.set("failure", { code, error: cause });
		return context.json({ message, code }, status);
	};
};
