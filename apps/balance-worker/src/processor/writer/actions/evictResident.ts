import type { ColdStartScope } from "@autumn/edge-config";
import { allStored } from "../pendingMutations.js";
import type { ResidentDrop } from "../subjectMap/types/subjectMap.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** 0–9999 from the customer key, so a customer's entities go with it and a rerun picks the same customers. */
const customerBucket = ({ customerKey }: { customerKey: string }): number =>
	Number(BigInt(Bun.hash(customerKey)) % 10_000n);

/** Leaves the scope cold, as a restart would: once the store holds every write before now, the scope's resident subjects go. */
export async function evictResident({
	scope,
	coldStart,
}: {
	scope: PartitionWriterScope;
	coldStart: ColdStartScope;
}): Promise<ResidentDrop> {
	const { fraction, keepActiveWithinMs } = coldStart;
	await allStored({ state: scope.state });
	return scope.state.subjects.dropResident({
		drops: ({ customerKey, idleMs }) =>
			customerBucket({ customerKey }) < fraction * 10_000 &&
			(keepActiveWithinMs === null || idleMs >= keepActiveWithinMs),
	});
}
