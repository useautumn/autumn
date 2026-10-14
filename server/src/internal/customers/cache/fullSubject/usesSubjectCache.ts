import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

export const usesSubjectCache = ({
	ctx,
	customerId,
}: {
	ctx: Pick<AutumnContext, "org" | "skipCache">;
	customerId: string | null | undefined;
}): boolean => {
	if (ctx.skipCache) return false;
	if (!customerId) return true;
	return !isBalanceWorkerRolloutEnabled({ ctx, customerId });
};
