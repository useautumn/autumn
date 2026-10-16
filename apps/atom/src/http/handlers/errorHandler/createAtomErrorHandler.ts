import type { Context, ErrorHandler } from "hono";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import { CustomerMovedError } from "../../../processor/ownership/customerMovedError.js";
import { forwardToAutumn } from "../../forward/forwardToAutumn.js";
import { hopMovedRequest } from "../../forward/hopMovedRequest.js";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import { IDEMPOTENCY_KEY_HEADER } from "../receiveCheck.js";
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

	/** A keyed finalize goes back unforwarded: its caller resends it to the API, where a forward would already hold its key. */
	async function leaveToApi(
		context: Context<AtomHttpEnv>,
		cause: CannotAnswerError,
	): Promise<Response> {
		const keyedFinalize =
			context.req.path === "/v1/balances.finalize" &&
			Boolean(context.req.header(IDEMPOTENCY_KEY_HEADER));
		if (!keyedFinalize) return forwardWithinCap(context, cause.reason);
		context.set("failure", { code: cause.reason, error: cause });
		return context.json(
			{
				message: "Atom cannot settle this finalize; ask the Autumn API",
				code: "atom_cannot_settle",
			},
			503,
		);
	}

	return async function handleError(cause, context) {
		if (cause instanceof CannotAnswerError) return leaveToApi(context, cause);
		// The customer moved on while this request waited: its owner decides it, or the API when they disagree.
		if (cause instanceof CustomerMovedError) {
			try {
				return await hopMovedRequest({ ctx, context, owner: cause.owner });
			} catch (error) {
				if (error instanceof CannotAnswerError)
					return leaveToApi(context, error);
				throw error;
			}
		}

		const { status, code, message } = atomErrorOf({ cause });
		context.set("failure", { code, error: cause });
		return context.json({ message, code }, status);
	};
};
