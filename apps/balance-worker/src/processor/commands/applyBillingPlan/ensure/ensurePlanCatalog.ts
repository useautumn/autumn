import {
	type ApplyBillingPlanCommand,
	createSubjectState,
	type SubjectState,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";

/** The rows the plan inserts, as a state, so their catalog references are found the way a subject's are. */
const insertedRowsState = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): SubjectState => {
	const inserts = command.ops.flatMap((op) => (op.op === "insert" ? [op] : []));
	return createSubjectState({
		identity: command.identity,
		customerProducts: inserts.flatMap((op) =>
			op.table === "customerProducts" ? [op.row] : [],
		),
		customerPrices: inserts.flatMap((op) =>
			op.table === "customerPrices" ? [op.row] : [],
		),
		customerEntitlements: inserts.flatMap((op) =>
			op.table === "customerEntitlements" ? [op.row] : [],
		),
	});
};

/** The catalog rows the plan's new rows reference, loaded before the writer; the server's copies only save the trip. */
export const ensurePlanCatalog = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): Promise<void> => {
	await scope.ctx.subjectHydrator.ensureCatalog({
		identity: command.identity,
		state: insertedRowsState({ command }),
	});
};
