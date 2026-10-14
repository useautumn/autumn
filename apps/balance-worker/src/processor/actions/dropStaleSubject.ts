import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { SubjectEvictReason } from "../writer/subjectMap/types/subjectDropReason.js";

/** Forget the customer's rows, including a load still in flight: the next command hydrates afresh. */
export async function dropStaleSubject({
	scope,
	identity,
	reason,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
	reason: SubjectEvictReason;
}): Promise<void> {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	scope.ctx.subjectHydrator.overtakeInFlightLoads({ customerKey });
	await scope.ctx.writer.evict({ customerKey, reason });
}
