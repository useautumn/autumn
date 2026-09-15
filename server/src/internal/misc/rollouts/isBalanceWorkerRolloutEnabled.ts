import { getBalanceWorkerRolloutEnabled } from "@autumn/env/balanceWorkerClient";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export function isBalanceWorkerRolloutEnabled({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean {
	return getBalanceWorkerRolloutEnabled() && ctx.env === AppEnv.Sandbox;
}
