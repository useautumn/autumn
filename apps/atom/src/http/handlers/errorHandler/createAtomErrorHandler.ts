import type { Context, ErrorHandler } from "hono";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import { forwardToAutumn } from "../../forward/forwardToAutumn.js";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import { atomErrorOf } from "./atomErrorOf.js";

export const MAX_FORWARDS_IN_FLIGHT = 256;

export const createAtomErrorHandler = ({
	ctx,
}: {
	ctx: AtomHttpContext;
}): ErrorHandler<AtomHttpEnv> => {
	let forwarding = 0;

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

	return function handleError(cause, context) {
		if (cause instanceof CannotAnswerError)
			return forwardWithinCap(context, cause.reason);

		const { status, code, message } = atomErrorOf({ cause });
		context.set("failure", { code, error: cause });
		return context.json({ message, code }, status);
	};
};
