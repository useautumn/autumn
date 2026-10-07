import { RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Reads with no DB-free fallback answer an over-cap org with a 429 the SDK retries. */
export const throwIfOrgRateLimited = ({ ctx }: { ctx: AutumnContext }) => {
	if (!ctx.orgRateLimitDegraded) return;

	throw new RecaseError({
		message: "Rate limit exceeded.",
		code: "rate_limit_exceeded",
		statusCode: 429,
	});
};
