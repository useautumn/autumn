import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * Non-prod outage simulation: a request sent with `x-balance-worker-outage: true`
 * never reaches the worker, exactly as a transport failure before any send looks.
 */
export const throwOnSimulatedBalanceWorkerOutage = ({
	ctx,
}: {
	ctx: Pick<AutumnContext, "testOptions">;
}): void => {
	if (process.env.NODE_ENV === "production") return;
	if (!ctx.testOptions?.balanceWorkerOutage) return;
	throw new BalanceWorkerClientError({
		code: "TRANSPORT",
		outcome: "not_submitted",
		message: "Simulated balance worker outage",
	});
};
