import { UnsupportedCommandError } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";

/** A private store never lands rows in Postgres, where the server reads a plan's rows back. */
export const requirePostgresStore = ({
	scope,
}: {
	scope: PartitionProcessorScope;
}): void => {
	if (scope.ctx.stateStore.baseline !== "map")
		throw new UnsupportedCommandError({
			reason: "billing_plan_needs_postgres_store",
		});
};
