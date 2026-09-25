import {
	type ApplyBillingPlanCommand,
	type BillingPlanEntityPart,
	type Catalog,
	mergeCatalogs,
	type SubjectState,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import { planInsertedRowsState } from "../ensure/ensurePlanCatalog.js";

/** What a plan's rebalances join the rows to: the customer's, the named entities', and the plan's new rows. None without a rebalance. */
export const readPlanCatalog = ({
	scope,
	command,
	customer,
	parts,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
	customer: SubjectState | null;
	parts: readonly BillingPlanEntityPart[];
}): Catalog | undefined => {
	const hasRebalance = command.ops.some(({ op }) => op === "rebalance");
	if (!hasRebalance) return undefined;
	const states = [
		...(customer ? [customer] : []),
		...parts.map(({ state }) => state),
		planInsertedRowsState({ command }),
	];
	return mergeCatalogs({
		catalogs: states.map((state) =>
			scope.ctx.subjectHydrator.readCatalog({ state }),
		),
	});
};
