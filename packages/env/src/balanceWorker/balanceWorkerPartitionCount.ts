import { z } from "zod";

const LOCAL_PARTITION_COUNT = 4;
const MAX_PARTITION_COUNT = 512;

const partitionCount = z.coerce.number().int().min(1).max(MAX_PARTITION_COUNT);

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
