import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { viewHasEntity } from "../subject/actions/ensureSubject/ensureSubjectState.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { resetMayBeDue } from "./ensureSubjectCurrent/earliestResetAt.js";
import { isGoneMidRequest } from "./withResidentSubject.js";

/** Why a command can't be decided without the asynchronous ensure. */
export type ResidentViewRefusal =
	| "not_resident"
	| "reset_due"
	| "catalog_evicted";

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
	if (!hasResidentCatalog({ scope, state: resident })) return "catalog_evicted";
	return null;
}

function hasResidentCatalog({
	scope,
	state,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState;
}): boolean {
	try {
		scope.ctx.subjectHydrator.readCatalog({ state });
		return true;
	} catch (cause) {
		if (isGoneMidRequest(cause)) return false;
		throw cause;
	}
}
