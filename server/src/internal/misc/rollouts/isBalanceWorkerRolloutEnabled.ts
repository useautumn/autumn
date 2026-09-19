import { AppEnv } from "@autumn/shared";
import { getBalanceWorkerRolloutEnabled } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export function isBalanceWorkerRolloutEnabled({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean {
	return getBalanceWorkerRolloutEnabled() && ctx.env === AppEnv.Sandbox;
}
