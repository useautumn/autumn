import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Runs system work inside a member's request without approval rules; only the user-facing entry point is judged.
 * Scoped to `run` and mutating in place, so the request's context keeps whatever the work sets on it. */
export const withApprovalSkipped = async <Result>({
	ctx,
	run,
}: {
	ctx: AutumnContext;
	run: () => Promise<Result>;
}): Promise<Result> => {
	const previous = ctx.skipApproval;
	ctx.skipApproval = true;
	try {
		return await run();
	} finally {
		ctx.skipApproval = previous;
	}
};
