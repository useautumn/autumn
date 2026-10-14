import { TwdError } from "../../../http/apiError.ts";
import type { Actor } from "../../../lib/types/actor.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const requireActor = ({ ctx }: { ctx: TwdContext }): Actor => {
	if (ctx.actor && ctx.actor.via !== "system") return ctx.actor;
	throw new TwdError({
		status: 401,
		code: "unauthenticated",
		message: "This action needs a signed-in user or an API key.",
		next: `sign in at ${ctx.env.TWD_PUBLIC_URL}/auth/google or pass Authorization: Bearer twd_…`,
		escalate: "ask a teammate for dashboard access / an API key",
	});
};
