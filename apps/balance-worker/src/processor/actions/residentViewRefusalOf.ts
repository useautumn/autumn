import type { MeteringIdentity } from "@autumn/balance-engine";
import { viewHasEntity } from "../subject/actions/ensureSubject/ensureSubjectState.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { resetMayBeDue } from "./ensureSubjectCurrent/earliestResetAt.js";

/** Why a command can't be decided without the asynchronous ensure. */
export type ResidentViewRefusal =
	| "not_resident"
	| "reset_due"
	| "catalog_stale";

/** The ensure's own view, checked without awaiting: the rows (an entity's included), current resets and catalog. */
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
