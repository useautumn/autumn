import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** Forget the customer's rows, including a load still in flight: the next command hydrates afresh. */
export async function dropStaleSubject({
	scope,
	identity,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
}): Promise<void> {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	scope.ctx.subjectHydrator.overtakeInFlightLoads({ customerKey });
	await scope.ctx.writer.evict({ customerKey });
}
