import type { ColdStartScope } from "@autumn/edge-config";
import { allStored } from "../pendingMutations.js";
import type { ResidentDrop } from "../subjectMap/types/subjectMap.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

const customerBucket = ({ customerKey }: { customerKey: string }): number =>
	Number(BigInt(Bun.hash(customerKey)) % 10_000n);

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
