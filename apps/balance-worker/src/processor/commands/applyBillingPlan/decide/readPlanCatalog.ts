import {
	type ApplyBillingPlanCommand,
	type BillingPlanEntityPart,
	type Catalog,
	mergeCatalogs,
	type SubjectState,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import { planInsertedRowsState } from "../ensure/ensurePlanCatalog.js";

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
	const needsCatalog = command.ops.some(
		({ op }) => op === "rebalance" || op === "addRollovers",
	);
	if (!needsCatalog) return undefined;
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
