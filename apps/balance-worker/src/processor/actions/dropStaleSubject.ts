import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

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
