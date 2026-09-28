import { z } from "zod";

// Local dev keeps just enough partitions to exercise routing without hundreds of Kafka producers.
const LOCAL_PARTITION_COUNT = 4;
const MAX_PARTITION_COUNT = 512;

const partitionCount = z.coerce.number().int().min(1).max(MAX_PARTITION_COUNT);

/**
 * How many partitions the deployment's topics have; server and workers must read the same value.
 * Part of customer placement: a new count needs a new deployment and fresh topics.
 */
export function getBalanceWorkerPartitionCount({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): number {
	const configured = runtimeEnv.BALANCE_WORKER_PARTITION_COUNT?.trim();
	if (configured) return partitionCount.parse(configured);
	if (runtimeEnv.NODE_ENV === "production") {
		throw new Error("BALANCE_WORKER_PARTITION_COUNT is required in production");
	}
	return LOCAL_PARTITION_COUNT;
}
