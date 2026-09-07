import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export function isBalanceWorkerRolloutEnabled({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean {
	return (
		getBalanceWorkerClientEnv().BALANCE_WORKER_ROLLOUT_ENABLED &&
		ctx.env === AppEnv.Sandbox
	);
}
