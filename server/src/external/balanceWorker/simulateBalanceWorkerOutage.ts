import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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
