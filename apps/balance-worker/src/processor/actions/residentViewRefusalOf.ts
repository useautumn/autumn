import type { MeteringIdentity } from "@autumn/balance-engine";
import { viewHasEntity } from "../subject/actions/ensureSubject/ensureSubjectState.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { resetMayBeDue } from "./ensureSubjectCurrent/earliestResetAt.js";

export type ResidentViewRefusal =
	| "not_resident"
	| "reset_due"
	| "catalog_stale";

export function residentViewRefusalOf({
	scope,
	identity,
	asOf,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
	asOf: number;
}): ResidentViewRefusal | null {
	const resident = scope.ctx.writer.readFreshestState({ identity });
	if (!resident || !viewHasEntity({ state: resident, identity }))
		return "not_resident";
	if (resetMayBeDue({ state: resident, asOf })) return "reset_due";
	if (!scope.ctx.subjectHydrator.peekCatalog({ state: resident }))
		return "catalog_stale";
	return null;
}
